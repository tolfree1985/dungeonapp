import { prisma } from "@/lib/prisma";
import type { SceneArtIdentity } from "@/lib/sceneArtIdentity";

export async function createSceneArtRow(identity: SceneArtIdentity) {
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
      imageUrl: null,
      tagsJson: null,
    },
  });
}
