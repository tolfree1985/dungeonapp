## Checkpoints

- **Known-good /play UX committed** – latest UI polish and submission feedback are captured in git.
- **Default dev adventure is the surviving UUID run** – the deterministic dev loop now uses the restored run ID.
- **Snapshot/reset safety workflow in place** – guarded scripts and naming conventions protect the canonical run.
- **Chronicle play loop fully operational** – turns resolve deterministically and the UI updates Latest Turn, State, Ledger, and Resolution Log in sync.
- **Consequences humanized** – engine flags (e.g., `observed.risk_2`) are now presented as readable state transitions instead of raw data.
- **Scene Art Contract** – SceneArt schema + shared prompt helpers added without runtime integration yet.
  - Added SceneArt schema + SceneArtStatus.
  - Implemented src/lib/sceneArt.ts with presets, sceneKey, and prompt builders.
  - Deterministic sceneKey + base/render prompts now available.
  - Added presentSceneArt presenter helper + NPC/tag helpers.
  - Play page now computes a SceneArtPayload (unused by UI yet).
  - SceneArt repo added for cache lookups & queueing.

### Scene Art Cache
- /api/turn now checks the SceneArt cache by sceneKey.
- Missing scenes queue a row (`queued`) instead of generating images immediately.
- The turn response now returns `sceneArt` status and cached URL to the client.
- Generation remains decoupled from `/api/turn`.

### Scene Image Display
- Added loadResolvedSceneImage to resolve the current/previous/location/default chain.
- Created SceneImagePanel to render the resolved asset with status chips.
- Play page now feeds the resolved image to `PlayClient`, so the UI never shows blank space.

### Scene Art Contract
- Added SceneArt schema + SceneArtStatus.
- Implemented src/lib/sceneArt.ts with presets, sceneKey, and prompt builders.
- Deterministic sceneKey + base/render prompts now available.
- Added presentSceneArt presenter helper + NPC/tag helpers.
- Play page now computes a SceneArtPayload (unused by UI yet).
- SceneArt repo added for cache lookups & queueing.
### Next UI/system focus
- Scene Art Cache – wire /api/turn to check/queue by sceneKey without generating images yet.

### Next UI focus
- **Pressure change feedback** – add a brief pulse or visual cue on the pressure display whenever pressure shifts, no logic changes.
## Checkpoint: Stale Adventure Hardening

- Redirect /play to a clean route when requested adventure no longer exists
- Clear recent adventure history when no adventureId is active
- Remove temporary route/client diagnostics
- Keep scene image panel stable with default fallback
