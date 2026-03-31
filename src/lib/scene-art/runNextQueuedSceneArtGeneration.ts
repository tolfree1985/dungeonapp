import {
  runQueuedSceneArtGeneration,
  type SceneArtAttemptResult,
} from "@/lib/scene-art/runQueuedSceneArtGeneration";
import { claimNextSceneArtForRender } from "@/lib/scene-art/claimNextSceneArtForRender";
import { getSceneArtWorkerId } from "@/lib/scene-art/workerIdentity";

export type RunNextResult = {
  sceneKey: string | null;
  promptHash: string | null;
  attemptResult?: SceneArtAttemptResult;
};

export async function runNextQueuedSceneArtGeneration(options?: { batchId?: string }): Promise<RunNextResult> {
  const workerId = getSceneArtWorkerId();
  const batchId = options?.batchId ?? null;
  const now = new Date();
  console.log("scene.art.worker.claim.search.begin", { workerId, batchId });
  const job = await claimNextSceneArtForRender(now, workerId);

  if (!job) {
    return { sceneKey: null, promptHash: null };
  }

  console.log("scene.art.worker.claim.found", {
    workerId,
    batchId,
    jobId: job.id,
    sceneKey: job.sceneKey,
    promptHash: job.promptHash,
  });

  const attemptResult = await runQueuedSceneArtGeneration({
    sceneKey: job.sceneKey,
    promptHash: job.promptHash,
    skipClaim: true,
    workerId,
  });

  if (!attemptResult || !attemptResult.outcome) {
    console.error("scene.art.claim.invalid_result", {
      sceneKey: job.sceneKey,
      promptHash: job.promptHash,
      attemptResult,
    });
  }

  console.log("scene.art.claim.result", {
    sceneKey: job.sceneKey,
    promptHash: job.promptHash,
    attemptResult: attemptResult?.outcome ?? "none",
  });

  console.log("scene.art.claim.return", {
    sceneKey: job.sceneKey,
    promptHash: job.promptHash,
    outcome: attemptResult?.outcome ?? null,
  });
  return {
    sceneKey: job.sceneKey,
    promptHash: job.promptHash,
    attemptResult: attemptResult ?? undefined,
  };
}
