import { SceneArtStatus } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { logSceneArtEvent } from "@/lib/scene-art/logging";

export type SceneArtIdentityInput = {
  sceneKey: string;
  promptHash: string;
};

export async function requeueSceneArt(identity: SceneArtIdentityInput) {
  const { sceneKey, promptHash } = identity;
  const existing = await prisma.sceneArt.findUnique({
    where: {
      sceneKey_promptHash: { sceneKey, promptHash },
    },
    select: {
      status: true,
    },
  });

  if (!existing) {
    throw new Error("Scene art row not found");
  }

  if (existing.status !== SceneArtStatus.failed) {
    throw new Error(`Cannot requeue row with status ${existing.status}`);
  }

  const updated = await prisma.sceneArt.update({
    where: {
      sceneKey_promptHash: { sceneKey, promptHash },
    },
    data: {
      status: SceneArtStatus.queued,
      generationStartedAt: null,
      generationLeaseUntil: null,
      leaseOwnerId: null,
      leaseAcquiredAt: null,
      lastRecoveredAt: new Date(),
    },
  });

  logSceneArtEvent("scene.art.requeued", {
    sceneKey: updated.sceneKey,
    promptHash: updated.promptHash,
    status: updated.status,
    attemptCount: updated.attemptCount,
  });

  console.log("scene.art.dev.requeued", {
    sceneKey: updated.sceneKey,
    promptHash: updated.promptHash,
    nextStatus: updated.status,
  });

  return updated;
}
