import { SceneArtIdentity } from "@/lib/sceneArtIdentity";
import { runQueuedSceneArtGeneration } from "@/lib/scene-art/runQueuedSceneArtGeneration";

export async function processSceneArtGeneration(identity: SceneArtIdentity): Promise<void> {
  return runQueuedSceneArtGeneration({
    sceneKey: identity.sceneKey,
    promptHash: identity.promptHash,
  });
}
