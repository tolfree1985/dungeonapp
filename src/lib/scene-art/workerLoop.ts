import { runNextQueuedSceneArtGeneration } from "@/lib/scene-art/runNextQueuedSceneArtGeneration";
import { logSceneArtEvent } from "@/lib/scene-art/logging";

export type SceneArtWorkerLoopOptions = {
  batchSize?: number;
  intervalMs?: number;
  signal?: AbortSignal;
};

export type SceneArtWorkerBatchResult = {
  processedCount: number;
  processedPromptHashes: string[];
  durationMs: number;
  idle: boolean;
};

export function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clampBatchSize(value?: number) {
  const requested = Number(value ?? 3);
  if (Number.isNaN(requested)) {
    return 3;
  }
  return Math.min(10, Math.max(1, requested));
}

export async function runSceneArtWorkerBatch({ batchSize }: Pick<SceneArtWorkerLoopOptions, "batchSize">): Promise<SceneArtWorkerBatchResult> {
  const target = clampBatchSize(batchSize);
  const start = Date.now();
  const processedPromptHashes: string[] = [];

  for (let i = 0; i < target; i += 1) {
    const result = await runNextQueuedSceneArtGeneration();
    if (!result?.promptHash) {
      break;
    }
    processedPromptHashes.push(result.promptHash);
  }

  const durationMs = Date.now() - start;

  return {
    processedCount: processedPromptHashes.length,
    processedPromptHashes,
    durationMs,
    idle: processedPromptHashes.length === 0,
  };
}

export async function startSceneArtWorkerLoop(options: SceneArtWorkerLoopOptions = {}) {
  const batchSize = clampBatchSize(options.batchSize);
  const intervalMs = Math.max(250, Number(options.intervalMs ?? 2000));
  const signal = options.signal;

  logSceneArtEvent("scene.art.worker.started", {
    sceneKey: "worker",
    promptHash: "worker",
    status: "queued",
    attemptCount: batchSize,
  });

  try {
    while (!signal?.aborted) {
      const batch = await runSceneArtWorkerBatch({ batchSize });

      if (batch.idle) {
        logSceneArtEvent("scene.art.worker.idle", {
          sceneKey: "worker",
          promptHash: "worker",
          status: "generating",
          attemptCount: batchSize,
        });
        await delay(intervalMs);
        continue;
      }

      logSceneArtEvent("scene.art.worker.batch_completed", {
        sceneKey: "worker",
        promptHash: batch.processedPromptHashes.join(","),
        status: "ready",
        attemptCount: batch.processedCount,
        durationMs: batch.durationMs,
      });
    }
  } finally {
    logSceneArtEvent("scene.art.worker.stopped", {
      sceneKey: "worker",
      promptHash: "worker",
      status: "failed",
      attemptCount: 0,
    });
  }
}
