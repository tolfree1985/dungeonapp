import { prisma } from "@/lib/prisma";
import type { SceneArtIdentity } from "@/lib/sceneArtIdentity";
import { assertSceneArtIdentity } from "@/lib/scene-art/assertSceneArtIdentity";

export async function createSceneArtRow(identity: SceneArtIdentity) {
  assertSceneArtIdentity(identity);
  return prisma.sceneArt.create({
    data: {
      sceneKey: identity.sceneKey,
      promptHash: identity.promptHash,
      title: identity.sceneKey,
      basePrompt: identity.basePrompt,
      renderPrompt: identity.renderPrompt,
      stylePreset: identity.stylePreset,
      renderMode: identity.renderMode,
      engineVersion: identity.engineVersion,
      status: "queued",
      imageUrl: identity.imageUrl,
      tagsJson: null,
    },
  });
}
