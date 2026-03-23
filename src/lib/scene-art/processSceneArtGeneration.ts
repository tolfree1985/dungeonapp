import { prisma } from "@/lib/prisma";
import { SceneArtStatus } from "@/generated/prisma";
import { SceneArtIdentity } from "@/lib/sceneArtIdentity";
import { generateSceneArtForIdentity } from "@/lib/scene-art/generateSceneArtForIdentity";
import { GENERATION_LEASE_MS } from "@/lib/scene-art/constants";
import { Prisma } from "@prisma/client";

export async function processSceneArtGeneration(identity: SceneArtIdentity): Promise<void> {
  const now = new Date();
  const leaseUntil = new Date(now.getTime() + GENERATION_LEASE_MS);
  const data: Prisma.SceneArtUpdateManyMutationInput = {
    status: SceneArtStatus.generating,
    generationStartedAt: now,
    generationLeaseUntil: leaseUntil,
    attemptCount: { increment: 1 },
  };
  const claimed = await prisma.sceneArt.updateMany({
    where: {
      sceneKey_promptHash: {
        sceneKey: identity.sceneKey,
        promptHash: identity.promptHash,
      },
      status: SceneArtStatus.queued,
    },
    data,
  });

  if (claimed.count !== 1) {
    return;
  }

  await generateSceneArtForIdentity(identity, { force: true });
}
