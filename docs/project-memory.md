# Project Memory

## Scene Art Identity Contract

Scene art always uses the canonical tuple `{ sceneKey, promptHash }` for every deterministic workflow:

- `sceneKey` is the hashed identifier derived from the canonical scene identity (`buildSceneKey(identity)`).
- `promptHash` is the hashed identifier of the rendered prompt (`buildPromptHash(...)`).
- This tuple is the ONLY valid lookup key for queueing, worker claims, `/api/scene-art`, refresh decisions, and client polling/rendering.

Human-readable names (e.g. `dock_office`, `location Id`, etc.) are metadata only. If you need them in logs, UI, or tooling, expose them as separate fields such as `sceneLabel` or `sceneLocation`, but never use them to derive identity.

Never build the canonical identity from render payloads, semantic labels, or partial state. Always normalize through `resolveCanonicalSceneIdentity` so the pair stays deterministic, complete, and prompt-aware.
