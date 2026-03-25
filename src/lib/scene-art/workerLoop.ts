import { SceneArtStatus } from "@/generated/prisma";
import { reclaimStaleSceneArt } from "@/lib/scene-art/reclaimStaleSceneArt";
import { runNextQueuedSceneArtGeneration } from "@/lib/scene-art/runNextQueuedSceneArtGeneration";
import type { SceneArtAttemptError } from "@/lib/scene-art/runQueuedSceneArtGeneration";
import { logSceneArtEvent } from "@/lib/scene-art/logging";
import { workerStateStore } from "@/lib/scene-art/workerStateStore";
import type { SceneArtWorkerBatchSummary } from "@/lib/scene-art/workerStateStore";
import { getSceneArtWorkerId } from "@/lib/scene-art/workerIdentity";

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
  reclaimedCount: number;
  batchCostUsd: number;
  billableAttempts: number;
  failedCount: number;
};

export type SceneArtWorkerHealthSnapshot = {
  running: boolean;
  paused: boolean;
  draining: boolean;
  startedAt: string | null;
  lastTickAt: string | null;
  lastBatchAt: string | null;
  lastProcessedCount: number;
  lastDurationMs: number | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
  lastBatchSummary: SceneArtWorkerBatchSummary | null;
  recentBatchHistory: SceneArtWorkerBatchSummary[];
};

type WorkerStopReason = "stopped" | "drained" | "aborted" | "failed";
const BATCH_HISTORY_LIMIT = 20;

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

let workerHealth: SceneArtWorkerHealthSnapshot = {
  running: false,
  paused: false,
  draining: false,
  startedAt: null,
  lastTickAt: null,
  lastBatchAt: null,
  lastProcessedCount: 0,
  lastDurationMs: null,
  lastErrorAt: null,
  lastErrorMessage: null,
  lastBatchSummary: null,
  recentBatchHistory: [],
};
let workerController: AbortController | null = null;
let workerTask: Promise<void> | null = null;

export async function pauseSceneArtWorker() {
  await workerStateStore.setControl({ paused: true });
  workerHealth.paused = true;
}

export async function resumeSceneArtWorker() {
  await workerStateStore.setControl({ paused: false });
  workerHealth.paused = false;
}

export async function isSceneArtWorkerPaused() {
  const control = await workerStateStore.getControl();
  return control.paused;
}

export async function drainSceneArtWorker() {
  await workerStateStore.setControl({ draining: true });
  workerHealth.draining = true;
}

export async function isSceneArtWorkerDraining() {
  const control = await workerStateStore.getControl();
  return control.draining;
}

export async function isSceneArtWorkerRunning() {
  const health = await workerStateStore.getHealth();
  return health.running;
}

export async function startSceneArtWorkerBackground(options: SceneArtWorkerLoopOptions = {}) {
  const health = await workerStateStore.getHealth();
  if (workerTask && health.running) {
    return;
  }

  const controller = new AbortController();
  workerController = controller;
  workerTask = startSceneArtWorkerLoop({ ...options, signal: controller.signal }).finally(() => {
    if (workerController === controller) {
      workerController = null;
    }
    workerTask = null;
  });
}

async function markWorkerStarted() {
  const control = await workerStateStore.getControl();
  const existingHealth = await workerStateStore.getHealth();
  const now = new Date().toISOString();
  workerHealth = {
    running: true,
    paused: control.paused,
    draining: control.draining,
    startedAt: now,
    lastTickAt: null,
    lastBatchAt: null,
    lastProcessedCount: 0,
    lastDurationMs: null,
    lastErrorAt: null,
    lastErrorMessage: null,
    lastBatchSummary: null,
    recentBatchHistory: existingHealth.recentBatchHistory,
  };
  await workerStateStore.updateHealth({
    running: true,
    paused: control.paused,
    draining: control.draining,
    startedAt: now,
    lastTickAt: null,
    lastBatchAt: null,
    lastProcessedCount: 0,
    lastDurationMs: null,
    lastErrorAt: null,
    lastErrorMessage: null,
    lastBatchSummary: null,
  });
}

async function recordWorkerTick(control: { paused: boolean; draining: boolean }) {
  const now = new Date().toISOString();
  workerHealth.lastTickAt = now;
  workerHealth.paused = control.paused;
  workerHealth.draining = control.draining;
  await workerStateStore.updateHealth({
    lastTickAt: now,
    paused: control.paused,
    draining: control.draining,
  });
}

async function recordBatchSuccess(
  batch: SceneArtWorkerBatchResult,
  summary: SceneArtWorkerBatchSummary
) {
  const now = summary.completedAt;
  workerHealth.lastBatchAt = now;
  workerHealth.lastProcessedCount = summary.processedCount;
  workerHealth.lastDurationMs = batch.durationMs;
  workerHealth.lastErrorAt = null;
  workerHealth.lastErrorMessage = null;
  workerHealth.lastBatchSummary = summary;
  appendBatchHistory(summary);
  await workerStateStore.updateHealth({
    lastBatchAt: now,
    lastProcessedCount: summary.processedCount,
    lastDurationMs: batch.durationMs,
    lastErrorAt: null,
    lastErrorMessage: null,
    lastBatchSummary: summary,
    recentBatchHistory: workerHealth.recentBatchHistory,
  });
}

async function recordBatchFailure(error: unknown, summary?: SceneArtWorkerBatchSummary) {
  const now = new Date().toISOString();
  workerHealth.lastErrorAt = now;
  workerHealth.lastErrorMessage = error instanceof Error ? error.message : String(error);
  workerHealth.lastDurationMs = null;
  workerHealth.lastProcessedCount = 0;
  if (summary) {
    workerHealth.lastBatchSummary = summary;
    appendBatchHistory(summary);
  }
  const payload: Partial<SceneArtWorkerHealthSnapshot> = {
    lastErrorAt: now,
    lastErrorMessage: workerHealth.lastErrorMessage,
    lastDurationMs: null,
    lastProcessedCount: 0,
  };
  if (summary) {
    payload.lastBatchSummary = summary;
    payload.recentBatchHistory = workerHealth.recentBatchHistory;
  }
  await workerStateStore.updateHealth(payload);
}

function appendBatchHistory(summary: SceneArtWorkerBatchSummary) {
  const history = [...workerHealth.recentBatchHistory, summary];
  workerHealth.recentBatchHistory = history.slice(-BATCH_HISTORY_LIMIT);
}

export async function runSceneArtWorkerBatch({ batchSize }: Pick<SceneArtWorkerLoopOptions, "batchSize">): Promise<SceneArtWorkerBatchResult> {
  const target = clampBatchSize(batchSize);
  const start = Date.now();
  const processedPromptHashes: string[] = [];
  let batchCostUsd = 0;
  let billableAttempts = 0;

  for (let i = 0; i < target; i += 1) {
    const result = await runNextQueuedSceneArtGeneration();
    if (!result?.promptHash) {
      break;
    }
    processedPromptHashes.push(result.promptHash);
    if (result.attemptResult) {
      batchCostUsd += result.attemptResult.lastAttemptCostUsd;
      billableAttempts += 1;
    }
  }

  const durationMs = Date.now() - start;

  return {
    processedCount: processedPromptHashes.length,
    processedPromptHashes,
    durationMs,
    idle: processedPromptHashes.length === 0,
    reclaimedCount: 0,
    batchCostUsd,
    billableAttempts,
    failedCount: 0,
  };
}

export async function startSceneArtWorkerLoop(options: SceneArtWorkerLoopOptions = {}) {
  const batchSize = clampBatchSize(options.batchSize);
  const intervalMs = Math.max(250, Number(options.intervalMs ?? 2000));
  const signal = options.signal;
  const limit = typeof options.maxIterations === "number" ? options.maxIterations : undefined;
  let iterations = 0;
  let stopReason: WorkerStopReason | null = null;

  await markWorkerStarted();
  logSceneArtEvent("scene.art.worker.started", {
    sceneKey: "worker",
    promptHash: "worker",
    status: "queued",
    attemptCount: batchSize,
  });

  try {
    while (true) {
      if (signal?.aborted) {
        stopReason = "aborted";
        break;
      }
      const control = await workerStateStore.getControl();
      await recordWorkerTick(control);
      if (control.paused && !control.draining) {
        await delay(intervalMs);
        continue;
      }
      const workerId = getSceneArtWorkerId();
      const batchId = `batch:${Date.now()}:${Math.random().toString(16).slice(2)}`;
      const batchStartedAt = new Date().toISOString();
      let reclaimedCount = 0;
      try {
        logSceneArtEvent("scene.art.batch_started", {
          sceneKey: "worker",
          promptHash: "worker",
          status: SceneArtStatus.generating,
          attemptCount: 0,
          batchId,
          workerId,
          startedAt: batchStartedAt,
          idle: true,
          processedCount: 0,
        });

        const reclaimResult = await reclaimStaleSceneArt();
        reclaimedCount = reclaimResult.reclaimedCount;

        const batch = await runSceneArtWorkerBatch({ batchSize });
        const completedAt = new Date().toISOString();
        const summary: SceneArtWorkerBatchSummary = {
          batchId,
          workerId,
          startedAt: batchStartedAt,
          completedAt,
          processedCount: batch.processedCount,
          claimedCount: batch.processedCount,
          failedCount: 0,
          reclaimedCount,
          idle: batch.idle,
          batchCostUsd: batch.batchCostUsd,
          billableAttempts: batch.billableAttempts,
        };

        await recordBatchSuccess(batch, summary);
        logSceneArtEvent("scene.art.batch_completed", {
          sceneKey: "worker",
          promptHash: batch.processedPromptHashes.join(",") || "worker",
          status: SceneArtStatus.ready,
          attemptCount: batch.processedCount,
          durationMs: batch.durationMs,
          batchId,
          workerId,
          startedAt: summary.startedAt,
          completedAt: summary.completedAt,
          processedCount: summary.processedCount,
          claimedCount: summary.claimedCount,
          failedCount: summary.failedCount,
          reclaimedCount: summary.reclaimedCount,
          idle: summary.idle,
        });

        logSceneArtEvent("scene.art.worker.tick", {
          sceneKey: "worker",
          promptHash: batch.processedPromptHashes.join(",") || "worker",
          status: batch.idle ? "generating" : "ready",
          attemptCount: batch.processedCount,
          durationMs: batch.durationMs,
          batchId,
          workerId,
        });

        if (batch.idle) {
          logSceneArtEvent("scene.art.worker.idle", {
            sceneKey: "worker",
            promptHash: "worker",
            status: "generating",
            attemptCount: batchSize,
            batchId,
            workerId,
          });
          await delay(intervalMs);
        } else {
          logSceneArtEvent("scene.art.worker.batch_completed", {
            sceneKey: "worker",
            promptHash: batch.processedPromptHashes.join(","),
            status: "ready",
            attemptCount: batch.processedCount,
            durationMs: batch.durationMs,
            batchId,
            workerId,
          });
        }

        if (control.draining && batch.processedCount === 0) {
          stopReason = "drained";
          break;
        }
      } catch (error) {
        const attemptResult =
          error && typeof error === "object" && "attemptResult" in error
            ? (error as SceneArtAttemptError).attemptResult
            : undefined;
        const failureSummary: SceneArtWorkerBatchSummary = {
          batchId,
          workerId,
          startedAt: batchStartedAt,
          completedAt: new Date().toISOString(),
          processedCount: 0,
          claimedCount: 0,
          failedCount: 1,
          reclaimedCount,
          idle: true,
          batchCostUsd: attemptResult?.lastAttemptCostUsd ?? 0,
          billableAttempts: attemptResult ? 1 : 0,
        };
        await recordBatchFailure(error, failureSummary);
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
        stopReason = stopReason ?? "stopped";
        break;
      }
    }
  } catch (error) {
    stopReason = "failed";
    throw error;
  } finally {
    const finalReason =
      stopReason ?? (signal?.aborted ? "aborted" : "stopped");
    logSceneArtEvent("scene.art.worker.stopped", {
      sceneKey: "worker",
      promptHash: "worker",
      status: finalReason,
      attemptCount: 0,
      reason: finalReason,
    });
    workerHealth.running = false;
    const finalControl = await workerStateStore.getControl();
    await workerStateStore.updateHealth({
      running: false,
      paused: finalControl.paused,
      draining: finalControl.draining,
    });
  }
}

export async function getSceneArtWorkerHealth(): Promise<SceneArtWorkerHealthSnapshot> {
  return workerStateStore.getHealth();
}

export async function resetSceneArtWorkerHealth() {
  workerHealth = {
    running: false,
    paused: false,
    draining: false,
    startedAt: null,
    lastTickAt: null,
    lastBatchAt: null,
    lastProcessedCount: 0,
    lastDurationMs: null,
    lastErrorAt: null,
    lastErrorMessage: null,
    lastBatchSummary: null,
    recentBatchHistory: [],
  };
  await workerStateStore.resetHealth();
}
