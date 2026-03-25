export function assertSceneArtIdentity(identity: { sceneKey?: string; promptHash?: string }) {
  if (!identity.sceneKey) {
    throw new Error("SCENE_ART_INVALID_IDENTITY: missing sceneKey");
  }
  if (!identity.promptHash) {
    throw new Error("SCENE_ART_INVALID_IDENTITY: missing promptHash");
  }
}
