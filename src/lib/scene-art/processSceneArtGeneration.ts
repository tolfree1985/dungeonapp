import { prisma } from "@/lib/prisma";
import { SceneArtStatus } from "@/generated/prisma";
import { SceneArtIdentity } from "@/lib/sceneArtIdentity";
import { generateSceneArtForIdentity } from "@/lib/scene-art/generateSceneArtForIdentity";

export async function processSceneArtGeneration(identity: SceneArtIdentity): Promise<void> {
  const claimed = await prisma.sceneArt.updateMany({
    where: {
      sceneKey_promptHash: {
        sceneKey: identity.sceneKey,
        promptHash: identity.promptHash,
      },
      status: SceneArtStatus.queued,
    },
    data: {
      status: SceneArtStatus.generating,
    },
  });

  if (claimed.count !== 1) {
    return;
  }

  await generateSceneArtForIdentity(identity, { force: true });
}
