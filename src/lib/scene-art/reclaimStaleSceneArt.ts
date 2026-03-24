import { SceneArtStatus } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { logSceneArtEvent } from "@/lib/scene-art/logging";

export async function reclaimStaleSceneArt(options?: { limit?: number }) {
  const now = new Date();
  const staleRows = await prisma.sceneArt.findMany({
    where: {
      status: SceneArtStatus.generating,
      generationLeaseUntil: {
        lt: now,
      },
    },
    orderBy: { generationLeaseUntil: "asc" },
    take: options?.limit,
  });

  if (staleRows.length === 0) {
    return { reclaimedCount: 0, promptHashes: [] };
  }

  const reclaimedPromptHashes: string[] = [];

  for (const row of staleRows) {
    const updated = await prisma.sceneArt.update({
      where: {
        sceneKey_promptHash: {
          sceneKey: row.sceneKey,
          promptHash: row.promptHash,
        },
      },
      data: {
        status: SceneArtStatus.queued,
        generationStartedAt: null,
        generationLeaseUntil: null,
      },
    });

    reclaimedPromptHashes.push(updated.promptHash);

    logSceneArtEvent("scene.art.reclaimed", {
      sceneKey: updated.sceneKey,
      promptHash: updated.promptHash,
      status: updated.status,
      attemptCount: updated.attemptCount ?? 0,
      generationLeaseUntil: row.generationLeaseUntil ?? null,
      generationStartedAt: row.generationStartedAt ?? null,
    });
  }

  return {
    reclaimedCount: reclaimedPromptHashes.length,
    promptHashes: reclaimedPromptHashes,
  };
}

export async function autoReclaimStaleSceneArt(options?: { limit?: number }) {
  const result = await reclaimStaleSceneArt({ limit: options?.limit });
  if (result.reclaimedCount > 0) {
    logSceneArtEvent("scene.art.auto_reclaimed", {
      sceneKey: "auto",
      promptHash: "auto",
      status: SceneArtStatus.queued,
      attemptCount: result.reclaimedCount,
      generationStartedAt: null,
      generationLeaseUntil: null,
    });
  }
  return result;
}
