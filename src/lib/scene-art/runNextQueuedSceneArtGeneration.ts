import { SceneArtStatus } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { runQueuedSceneArtGeneration } from "@/lib/scene-art/runQueuedSceneArtGeneration";

export type RunNextResult = {
  sceneKey: string | null;
  promptHash: string | null;
  attemptResult?: SceneArtAttemptResult;
};

export async function runNextQueuedSceneArtGeneration(): Promise<RunNextResult> {
  const row = await prisma.sceneArt.findFirst({
    where: { status: SceneArtStatus.queued },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      sceneKey: true,
      promptHash: true,
    },
  });

  if (!row) {
    return { sceneKey: null, promptHash: null };
  }

  if (!row.sceneKey || !row.promptHash) {
    await prisma.sceneArt.update({
      where: { id: row.id },
      data: { status: SceneArtStatus.failed },
    });

    throw new Error("SCENE_ART_INVALID_IDENTITY: queued row missing sceneKey or promptHash");
  }

  const attemptResult = await runQueuedSceneArtGeneration({
    sceneKey: row.sceneKey,
    promptHash: row.promptHash,
  });

  return {
    sceneKey: row.sceneKey,
    promptHash: row.promptHash,
    attemptResult: attemptResult ?? undefined,
  };
}
