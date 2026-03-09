---

## 📊 Pricing & Cost Review Triggers

This project intentionally delays final pricing decisions until real usage data exists.

We do NOT optimize for unlimited turns early.
We optimize for deterministic engine stability and meaningful gameplay first.

### 🎯 Decision Gates (Objective Triggers)

Pricing and turn limits will only be reviewed when ONE of the following happens:

- 10,000 total turns logged
- 100 active users
- Cost per user exceeds 30% of subscription price

Until one of those triggers occurs:

- No pricing changes
- No turn cap increases
- No unlimited promises
- No premature cost optimizations

---

## 💰 Cost Philosophy

This system is engineered to reduce marginal token cost per turn by:

- Externalizing state (state-driven narrative)
- Enforcing consequences in-engine
- Avoiding large context injections
- Using deterministic lifecycle rules
- Supporting smaller model usage where possible

The goal is:

> Spend engineering effort to reduce per-turn token burn.

---

## 🚀 Current Phase

We are in:

ENGINE + UX VALIDATION PHASE

Focus:
- Deterministic intercept lifecycle
- Replay safety
- Escalation → consequence mapping
- Clear player-facing pressure UX

NOT focus:
- Pricing tiers
- Unlimited marketing
- Growth hacks

Those come after real usage data.

---

## Determinism Invariants

- `/api/scenario/mine` exists and is part of the stable scenario surface.
- Deterministic scripts: `scripts/test-route-scenario-mine.ts`, `scripts/test-route-scenario-public-page.ts`, `scripts/test-route-scenario-mine-page.ts`.
- Ordering invariant: `updatedAt desc`, then `id desc`.
- UI rule: no merge, dedupe, reorder, or local filter client-side.

## Sprint Notes

- 9.29 — Copy focused view export + deterministic UI test
- 9.58 — Replay/focused export controls + deterministic status signal assertions
- Sprint 9 complete — Deterministic Inspector + Replay + Accessibility + Export Hardening
- Sprint 10A complete — Creator tools MVP with deterministic editor validation, preview, publish gating, and creator UX safety checks
- Sprint 10C complete — deterministic creator editing hardening and operator closure:
- Strict JSON import with canonical inline error block (no stack leakage).
- Validation grouping is stable by `path` then `code`; preflight is pure UI-derived.
- Cap/rate-limit banner is deterministic and clears on editor input changes.
- Prompt scaffold + memory preview rendering/export use stable ordering.
- Unsaved indicator is pure snapshot-derived (no autosave/timers/debounce).
- Sprint 11 complete — creator launch hardening and route envelope parity:
- Creator UI now has deterministic debug bundle + shareable debug link exports.
- Lint warnings are non-blocking and deterministic; empty states/status copy is consistent.
- Scenario create/publish routes share additive safe error envelope shape (`error`, `code`) without behavior changes.
- Smoke surface includes deterministic route envelope parity coverage.
- Deploy runbook now includes a Sprint 11 launch hardening checklist stub.

## Release Registry Guidance

- Append-only runs (CI, tagged releases): omit `--clean-registry` so the registry/index stay immutable and any drift fails fast.
- Dev/iterate runs: pass `--clean-registry` to allow the tooling to delete the module entries/cache before rerunning, keeping repeated executions stable without leaving stale data.

## Testing the DB-backed scenario loader

Run the regression harness with the dedicated script:

```bash
pnpm run test:scenario-db
```

The command executes the Node-native suite without touching the live database.

## Turn health smoke checklist

When you deploy a new turn or billing change, verify the observable guardrails:

1. Post one turn via `/api/turn` and confirm `turn.health` logs appear with `branch`, `userId`, `adventureId`, and `success: true`.
2. Trigger a usage limit or guard denial and confirm `turn.denied`/`turn.failure` logs include the failure `code` and context.
3. Validate `/api/scenario` and `/api/adventure/from-scenario` errors log `SCENARIO_INVALID` or `SCENARIO_NOT_FOUND` along with the impacted `scenarioId`.
4. Keep the smoke script results (happy path + denial) alongside the logs before flipping `TURN_PIPELINE` flags.

## Creator Save → Publish → Play workflow

The creator UI now follows a linear flow:

1. **Save scenario**: the button at the bottom of the Publish panel posts the draft to `/api/scenario` and caches the returned scenario ID. Inline validation issues from `validateScenarioContentJson` block the save until they are resolved.
2. **Publish scenario**: click Publish from an authenticated browser session. The action calls `/api/scenario/[id]/publish`, surfaces structured errors like `SCENARIO_INVALID`, `SCENARIO_NOT_FOUND`, or `NOT_OWNER` next to the controls, and only succeeds when the current draft is saved and passes determinism checks.
3. **Play this scenario**: once published, the Play button calls `/api/adventure/from-scenario`, opens `/play?adventureId=...` in a new tab, and shows the resulting adventure ID so you can inspect it immediately.

This keeps manual JSON edits to a minimum and ensures the publish step only runs after save + validation pass.

## MVP readiness

Use `/Users/craigtolfree/dungeonpp/docs/mvp-readiness.md` as the current launch checklist for auth, billing, failure-state, and runtime/deploy readiness.

## Browser-session auth

Protected creator, scenario-management, adventure, and turn flows now derive identity from a signed browser session cookie.

Local setup:

1. Copy values from `.env.example` into your local env file.
2. Set `AUTH_CREDENTIALS` to one or more `username=password` pairs.
3. Set `AUTH_SESSION_SECRET` to a long random string.
4. Start the app and sign in at `/login`.

Optional operator fallback:

- If you still need non-browser operator access, keep `API_KEY` configured.
- Protected routes prefer the browser session and only fall back to the API key when no session is present.
