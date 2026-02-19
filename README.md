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

- `/api/scenario/mine?ownerId=...` exists and is part of the stable scenario surface.
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
