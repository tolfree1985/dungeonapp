import { SceneArtStatus } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { runQueuedSceneArtGeneration } from "@/lib/scene-art/runQueuedSceneArtGeneration";
import { getSceneArtWorkerId } from "@/lib/scene-art/workerIdentity";

export type RunNextResult = {
  sceneKey: string | null;
  promptHash: string | null;
  attemptResult?: SceneArtAttemptResult;
};

export async function runNextQueuedSceneArtGeneration(): Promise<RunNextResult> {
  const workerId = getSceneArtWorkerId();
  const now = new Date();
  const nextQueued = await prisma.sceneArt.findFirst({
    where: {
      status: SceneArtStatus.queued,
      OR: [
        { generationLeaseUntil: null },
        { generationLeaseUntil: { lt: now } },
      ],
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      sceneKey: true,
      promptHash: true,
      attemptCount: true,
      leaseOwnerId: true,
      generationLeaseUntil: true,
    },
  });


  if (!nextQueued) {
    return { sceneKey: null, promptHash: null };
  }
  if (!nextQueued.sceneKey || !nextQueued.promptHash) {
    await prisma.sceneArt.update({
      where: { id: nextQueued.id },
      data: { status: SceneArtStatus.failed },
    });

    throw new Error("SCENE_ART_INVALID_IDENTITY: queued row missing sceneKey or promptHash");
  }

  console.log("scene.art.reclaim.execute", {
    sceneKey: nextQueued.sceneKey,
    promptHash: nextQueued.promptHash,
  });
  const attemptResult = await runQueuedSceneArtGeneration({
    sceneKey: nextQueued.sceneKey,
    promptHash: nextQueued.promptHash,
  });

  if (!attemptResult || !attemptResult.outcome) {
    console.error("scene.art.claim.invalid_result", {
      sceneKey: nextQueued.sceneKey,
      promptHash: nextQueued.promptHash,
      attemptResult,
    });
  }

  console.log("scene.art.claim.result", {
    sceneKey: nextQueued.sceneKey,
    promptHash: nextQueued.promptHash,
    attemptResult: attemptResult?.outcome ?? "none",
  });

  console.log("scene.art.claim.return", {
    sceneKey: nextQueued.sceneKey,
    promptHash: nextQueued.promptHash,
    outcome: attemptResult?.outcome ?? null,
  });
  return {
    sceneKey: nextQueued.sceneKey,
    promptHash: nextQueued.promptHash,
    attemptResult: attemptResult ?? undefined,
  };
}
