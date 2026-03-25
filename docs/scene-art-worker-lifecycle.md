# Scene Art Worker Lifecycle

## Overview
The worker manages asynchronous scene-art generation with deterministic identity, observability, and operational controls. Operators interact with the worker through REST routes and the /dev/scene-art-worker UI. Every transition is explicit: start, pause, resume, drain, stop, restart.

## Queue Endpoints
- `GET /api/scene-art/worker/queue` — lists queued/generating rows with lease/attempt metadata.
- `POST /api/scene-art/worker/run-next` — process the oldest queued job.
- `POST /api/scene-art/worker/run/[promptHash]` — target-run a queued row.
- `POST /api/scene-art/worker/run-batch` — bounded batch (limit ≤ 10) of `run-next` iterations.
- `POST /api/scene-art/worker/reclaim-stale` — reclaim generating rows whose lease expired.

## Worker Control Routes
| Route | Description |
| --- | --- |
| `POST /api/scene-art/worker/start` | Boot or restart the worker loop. Idempotent; no-op if already running. Resets `running=true`, clears paused/draining state, and starts processing queued jobs. |
| `POST /api/scene-art/worker/pause` | Pause intake before the next batch. Does not interrupt an active batch. |
| `POST /api/scene-art/worker/resume` | Resume from paused state and continue processing. |
| `POST /api/scene-art/worker/drain` | Switch to drain mode: finish existing queue, stop new intake, and exit when `processedCount === 0`. Stopping happens once the drain completes. |

## Health Endpoint
- `GET /api/scene-art/worker/health` returns the snapshot:
  - `running` | worker loop active
  - `paused` | intake blocked
  - `draining` | worker stopping after queue drains
  - `startedAt`, `lastTickAt`, `lastBatchAt`, `lastProcessedCount`, `lastDurationMs`, `lastErrorAt`, `lastErrorMessage`
  - UI uses `status` derived with priority: `draining` > `stopped` > `paused` > `error` > `idle` > `running`.

## Control Semantics
- **Start** – explicit bootstrap. Safe to call after stop/drain; idempotent.
- **Pause/Resume** – toggles before batch boundaries. Pausing while draining has no effect; draining overrides pause.
- **Drain/Stop** – draining sets the worker to finish the remaining queue, then it stops (`running=false`). The UI shows “Draining…” and hides runtime controls until it completes.
- **Restart** – call `POST /start` after `drain`/stop. Queued work persists and resumes from the last identity.

## UI Notes
`/dev/scene-art-worker` renders:
- Queue listing + stats
- Worker health panel (status badge plus Start/Pause/Resume/Drain controls)
- Only the Start action shows when `running=false`; otherwise pause/resume/drain are available.
- Status labels keep copy consistent across states (Paused/Error/Draining/Stopped/Idle/Running).

## Operator Guidance
- Recovery paths (`run-next`, `run/[promptHash]`, `run-batch`) are manual and don’t run automatically.
- Auto-reclaim may trigger when queue/worker APIs are called, but only stale jobs are touched.
- Always inspect health before starting or draining; logs (`scene.art.worker.*`) capture hooks for `queued`, `tick`, `batch_completed`, `idle`, `batch_failed`, `stopped`.
