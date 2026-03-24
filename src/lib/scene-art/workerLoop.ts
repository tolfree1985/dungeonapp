import { runNextQueuedSceneArtGeneration } from "@/lib/scene-art/runNextQueuedSceneArtGeneration";
import { logSceneArtEvent } from "@/lib/scene-art/logging";

export type SceneArtWorkerLoopOptions = {
  batchSize?: number;
  intervalMs?: number;
  signal?: AbortSignal;
  maxIterations?: number;
};

export type SceneArtWorkerBatchResult = {
  processedCount: number;
  processedPromptHashes: string[];
  durationMs: number;
  idle: boolean;
};

export type SceneArtWorkerHealthSnapshot = {
  running: boolean;
  startedAt: string | null;
  lastTickAt: string | null;
  lastBatchAt: string | null;
  lastProcessedCount: number;
  lastDurationMs: number | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
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

const workerHealth: SceneArtWorkerHealthSnapshot = {
  running: false,
  startedAt: null,
  lastTickAt: null,
  lastBatchAt: null,
  lastProcessedCount: 0,
  lastDurationMs: null,
  lastErrorAt: null,
  lastErrorMessage: null,
};

function markWorkerStarted() {
  const now = new Date().toISOString();
  workerHealth.running = true;
  workerHealth.startedAt = now;
  workerHealth.lastTickAt = null;
  workerHealth.lastBatchAt = null;
  workerHealth.lastProcessedCount = 0;
  workerHealth.lastDurationMs = null;
  workerHealth.lastErrorAt = null;
  workerHealth.lastErrorMessage = null;
}

function recordWorkerTick() {
  workerHealth.lastTickAt = new Date().toISOString();
}

function recordBatchSuccess(batch: SceneArtWorkerBatchResult) {
  workerHealth.lastBatchAt = new Date().toISOString();
  workerHealth.lastProcessedCount = batch.processedCount;
  workerHealth.lastDurationMs = batch.durationMs;
  workerHealth.lastErrorAt = null;
  workerHealth.lastErrorMessage = null;
}

function recordBatchFailure(error: unknown) {
  workerHealth.lastErrorAt = new Date().toISOString();
  workerHealth.lastErrorMessage = error instanceof Error ? error.message : String(error);
  workerHealth.lastDurationMs = null;
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
  const limit = typeof options.maxIterations === "number" ? options.maxIterations : undefined;
  let iterations = 0;

  markWorkerStarted();
  logSceneArtEvent("scene.art.worker.started", {
    sceneKey: "worker",
    promptHash: "worker",
    status: "queued",
    attemptCount: batchSize,
  });

  try {
    while (!signal?.aborted) {
      recordWorkerTick();
      try {
        const batch = await runSceneArtWorkerBatch({ batchSize });
        recordBatchSuccess(batch);
        logSceneArtEvent("scene.art.worker.tick", {
          sceneKey: "worker",
          promptHash: batch.processedPromptHashes.join(",") || "worker",
          status: batch.idle ? "generating" : "ready",
          attemptCount: batch.processedCount,
          durationMs: batch.durationMs,
        });

        if (batch.idle) {
          logSceneArtEvent("scene.art.worker.idle", {
            sceneKey: "worker",
            promptHash: "worker",
            status: "generating",
            attemptCount: batchSize,
          });
          await delay(intervalMs);
        } else {
          logSceneArtEvent("scene.art.worker.batch_completed", {
            sceneKey: "worker",
            promptHash: batch.processedPromptHashes.join(","),
            status: "ready",
            attemptCount: batch.processedCount,
            durationMs: batch.durationMs,
          });
        }
      } catch (error) {
        recordBatchFailure(error);
        logSceneArtEvent("scene.art.worker.batch_failed", {
          sceneKey: "worker",
          promptHash: "worker",
          status: "failed",
          attemptCount: 0,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
        await delay(intervalMs);
      } finally {
        iterations += 1;
      }

      if (limit !== undefined && iterations >= limit) {
        break;
      }
    }
  } finally {
    logSceneArtEvent("scene.art.worker.stopped", {
      sceneKey: "worker",
      promptHash: "worker",
      status: "failed",
      attemptCount: 0,
    });
    workerHealth.running = false;
  }
}

export function getSceneArtWorkerHealth(): SceneArtWorkerHealthSnapshot {
  return { ...workerHealth };
}

export function resetSceneArtWorkerHealth() {
  workerHealth.running = false;
  workerHealth.startedAt = null;
  workerHealth.lastTickAt = null;
  workerHealth.lastBatchAt = null;
  workerHealth.lastProcessedCount = 0;
  workerHealth.lastDurationMs = null;
  workerHealth.lastErrorAt = null;
  workerHealth.lastErrorMessage = null;
}
