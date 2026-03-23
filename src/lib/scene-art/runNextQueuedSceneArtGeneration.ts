import { SceneArtStatus } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { runQueuedSceneArtGeneration } from "@/lib/scene-art/runQueuedSceneArtGeneration";

export type RunNextResult = { promptHash: string | null };

export async function runNextQueuedSceneArtGeneration(): Promise<RunNextResult> {
  const row = await prisma.sceneArt.findFirst({
    where: { status: SceneArtStatus.queued },
    orderBy: { createdAt: "asc" },
    select: { promptHash: true },
  });

  if (!row) {
    return { promptHash: null };
  }

  await runQueuedSceneArtGeneration(row.promptHash);
  return { promptHash: row.promptHash };
}
