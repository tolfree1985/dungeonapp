import { prisma } from "@/lib/prisma";
import { SceneArtStatus } from "@/generated/prisma";
import type { SceneArt } from "@prisma/client";
import { generateImage } from "@/lib/sceneArtGenerator";
import type { SceneArtIdentity } from "@/lib/sceneArtIdentity";

const DEFAULT_PROVIDER_SOURCE = { provider: "remote" };

export async function generateSceneArtForIdentity(
  identity: SceneArtIdentity,
  _options?: { force?: boolean },
): Promise<SceneArt> {
  const uniqueWhere = {
    sceneKey_promptHash: {
      sceneKey: identity.sceneKey,
      promptHash: identity.promptHash,
    },
  };

  try {
    const generated = await generateImage(identity.prompt.renderPrompt, identity.sceneKey, identity.promptHash);
    const updated = await prisma.sceneArt.update({
      where: uniqueWhere,
      data: {
        basePrompt: identity.basePrompt,
        renderPrompt: identity.renderPrompt,
        imageUrl: generated.imageUrl,
        status: SceneArtStatus.ready,
        tagsJson: JSON.stringify({ ...(generated.provider ? { provider: generated.provider } : DEFAULT_PROVIDER_SOURCE) }),
      },
    });
    return updated;
  } catch (error) {
    await prisma.sceneArt.update({
      where: uniqueWhere,
      data: {
        status: SceneArtStatus.failed,
        tagsJson: null,
      },
    });
    throw error;
  }
}
