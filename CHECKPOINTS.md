## Checkpoints

- **Known-good /play UX committed** – latest UI polish and submission feedback are captured in git.
- **Default dev adventure is the surviving UUID run** – the deterministic dev loop now uses the restored run ID.
- **Snapshot/reset safety workflow in place** – guarded scripts and naming conventions protect the canonical run.
- **Chronicle play loop fully operational** – turns resolve deterministically and the UI updates Latest Turn, State, Ledger, and Resolution Log in sync.
- **Consequences humanized** – engine flags (e.g., `observed.risk_2`) are now presented as readable state transitions instead of raw data.

### Next UI focus
- **Pressure change feedback** – add a brief pulse or visual cue on the pressure display whenever pressure shifts, no logic changes.
