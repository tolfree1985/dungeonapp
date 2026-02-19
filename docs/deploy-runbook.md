# Deploy Runbook

## Prereqs
- Node.js 20.x (matches CI workflows).
- `npm` available.
- Database access for target environment.
- Environment variables set (see below).

## Node version
- Use Node.js 20.x.

## DB required
- Local/dev: SQLite via `bash scripts/with-sqlite-env.sh ...`.
- Production: Postgres via `DATABASE_URL`.

## Environment variables
Only variables currently read by app/runtime code are listed.

### Required
- `DATABASE_URL` (Prisma datasource connection string).

### Optional runtime
- `API_KEY` (used by API-key-protected routes).
- `NARRATOR_MODE` (defaults to `stub`).
- `SCENARIO_MAX_PER_OWNER` (owner scenario cap; default is applied if unset).
- `SOFT_RATE_LIMIT_SCENARIO_CREATE_PER_MIN` (create route soft limit; default if unset).
- `SOFT_RATE_LIMIT_SCENARIO_FORK_PER_MIN` (fork route soft limit; default if unset).

### Dev/test-only toggles
- `BILLING_TEST_CAP`
- `BILLING_TEST_LATENCY_MS`

## Database migrations
- Production:
  - `npx prisma migrate deploy`
- Local:
  - `bash scripts/with-sqlite-env.sh npx prisma migrate dev`

## Build & start
- `npm ci`
- `npm run build`
- `npm run start`

## Post-deploy verification
- `npm run ci:billing`
- `npm run ci:creator`
- Run deterministic smoke command (below).

## Creator billing/cap support (Sprint 10B)
- Creator inline errors must use deterministic static copy only.
- No retry countdowns, autosave, or timed UI resets in creator billing/cap flows.
- `/api/turn` errors must remain normalized and non-leaky:
  - preserve stable `error`/`code` fields
  - never include stack traces or internal Prisma messages
- Keep deterministic checks green:
  - `bash scripts/with-sqlite-env.sh node --import tsx scripts/test-route-turn-error-normalization.ts`
  - `bash scripts/with-sqlite-env.sh node --import tsx scripts/test-creator-error-mapping.ts`
  - `bash scripts/with-sqlite-env.sh node --import tsx scripts/test-ui-creator-page.ts`

## Creator deterministic controls (Sprint 10C)
- Operator expectation: creator editor controls are deterministic (no autosave, no retry timers, no random output).
- JSON import must fail with canonical inline error text only; no stack traces.
- Preflight + publish gating are UI-derived only; no extra backend preflight calls.
- Prompt/memory previews and copy exports must use stable section ordering and stable key ordering.
- Verify creator deterministic surface:
  - `npm run ci:creator`
  - `bash scripts/with-sqlite-env.sh node --import tsx scripts/test-creator-error-mapping.ts`
  - `bash scripts/with-sqlite-env.sh node --import tsx scripts/test-ui-creator-page.ts`

## Deterministic smoke command
Run in CI/staging with valid `DATABASE_URL`:

```bash
node --import tsx scripts/smoke-prod-surface.ts
```

## Rollback
- Roll back code to the previous known-good release and redeploy.
- Re-run verification suite after rollback.
- Migration policy: forward-only unless an explicit down-migration policy is introduced.
  - If a migration causes an issue, prefer a follow-up corrective migration.

## Determinism invariants checklist
- `scripts/with-sqlite-env.sh` must set a valid SQLite `DATABASE_URL` (`file:` URL form).
- `scripts/with-sqlite-env.sh` must run `npx prisma migrate deploy` before wrapped commands.
- All deterministic scripts should be executed via `scripts/with-sqlite-env.sh`.

- Replay invariant:
  - `bash scripts/with-sqlite-env.sh node --import tsx scripts/test-replay-invariant.ts`
- Scenario mine/public paging invariants:
  - `bash scripts/with-sqlite-env.sh node --import tsx scripts/test-route-scenario-public-page.ts`
  - `bash scripts/with-sqlite-env.sh node --import tsx scripts/test-route-scenario-mine-page.ts`
- Cap invariants:
  - `bash scripts/with-sqlite-env.sh node --import tsx scripts/test-route-scenario-create-cap.ts`
  - `bash scripts/with-sqlite-env.sh node --import tsx scripts/test-route-scenario-fork-cap.ts`
- Error safety invariant:
  - `bash scripts/with-sqlite-env.sh node --import tsx scripts/test-route-error-safety.ts`
- UI consequences drawer invariant:
  - `bash scripts/with-sqlite-env.sh node --import tsx scripts/test-ui-consequences-drawer.ts`
