import { SceneArtStatus } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { logSceneArtEvent } from "@/lib/scene-art/logging";

export async function reclaimStaleSceneArt() {
  const now = new Date();
  const staleRows = await prisma.sceneArt.findMany({
    where: {
      status: SceneArtStatus.generating,
      generationLeaseUntil: {
        lt: now,
      },
    },
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
