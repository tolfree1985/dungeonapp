import { beforeEach, describe, expect, it, vi } from "vitest";
import * as workerLoop from "@/lib/scene-art/workerLoop";
import { runNextQueuedSceneArtGeneration } from "@/lib/scene-art/runNextQueuedSceneArtGeneration";
import { getSceneArtLogs, resetSceneArtLogs } from "@/lib/scene-art/logging";

const { storeStateRef, workerStateStoreMock, makeDefaultState, reclaimStaleSceneArtMock } = vi.hoisted(() => {
  const makeDefaultState = () => ({
    control: {
      paused: false,
      draining: false,
    },
    health: {
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
    },
  });

  const storeStateRef = { current: makeDefaultState() };

  const workerStateStoreMock = {
    getControl: vi.fn(async () => ({ ...storeStateRef.current.control })),
    setControl: vi.fn(
      async (next: Partial<typeof storeStateRef.current.control>) => {
        storeStateRef.current.control = {
          ...storeStateRef.current.control,
          ...next,
        };
        storeStateRef.current.health = {
          ...storeStateRef.current.health,
          paused: storeStateRef.current.control.paused,
          draining: storeStateRef.current.control.draining,
        };
      }
    ),
    getHealth: vi.fn(async () => ({ ...storeStateRef.current.health })),
    updateHealth: vi.fn(
      async (next: Partial<typeof storeStateRef.current.health>) => {
        storeStateRef.current.health = {
          ...storeStateRef.current.health,
          ...next,
        };
      }
    ),
    resetHealth: vi.fn(async () => {
      const controlSnapshot = { ...storeStateRef.current.control };
      storeStateRef.current = makeDefaultState();
      storeStateRef.current.control = controlSnapshot;
      storeStateRef.current.health.paused = controlSnapshot.paused;
      storeStateRef.current.health.draining = controlSnapshot.draining;
    }),
  };

  const reclaimStaleSceneArtMock = vi.fn(async () => ({ reclaimedCount: 0, promptHashes: [] }));

  return {
    storeStateRef,
    workerStateStoreMock,
    makeDefaultState,
    reclaimStaleSceneArtMock,
  };
});

vi.mock("@/lib/scene-art/workerStateStore", () => ({
  workerStateStore: workerStateStoreMock,
}));

vi.mock("@/lib/scene-art/runNextQueuedSceneArtGeneration", () => ({
  runNextQueuedSceneArtGeneration: vi.fn(),
}));

const makeRunNextResult = (promptHash: string, cost = 1) => ({
  sceneKey: `scene-${promptHash}`,
  promptHash,
  attemptResult: {
    sceneKey: `scene-${promptHash}`,
    promptHash,
    lastAttemptCostUsd: cost,
  },
});

vi.mock("@/lib/scene-art/reclaimStaleSceneArt", () => ({
  reclaimStaleSceneArt: reclaimStaleSceneArtMock,
}));

beforeEach(() => {
  vi.clearAllMocks();
  storeStateRef.current = makeDefaultState();
  workerLoop.resetSceneArtWorkerHealth();
  resetSceneArtLogs();
  reclaimStaleSceneArtMock.mockResolvedValue({ reclaimedCount: 0, promptHashes: [] });
});

describe("scene art worker loop", () => {
  it("processes up to batch size and returns prompt hashes", async () => {
    const runNext = runNextQueuedSceneArtGeneration as unknown as vi.Mock;
    runNext.mockResolvedValueOnce(makeRunNextResult("a"));
    runNext.mockResolvedValueOnce(makeRunNextResult("b"));
    runNext.mockResolvedValue({ promptHash: null });

    const result = await workerLoop.runSceneArtWorkerBatch({ batchSize: 5 });

    expect(result.processedCount).toBe(2);
    expect(result.processedPromptHashes).toEqual(["a", "b"]);
    expect(result.idle).toBe(false);
    expect(runNext).toHaveBeenCalledTimes(3);
  });

  it("stops when queue empty and marks idle", async () => {
    const runNext = runNextQueuedSceneArtGeneration as unknown as vi.Mock;
    runNext.mockResolvedValue({ promptHash: null });

    const result = await workerLoop.runSceneArtWorkerBatch({ batchSize: 3 });

    expect(result.processedCount).toBe(0);
    expect(result.idle).toBe(true);
    expect(runNext).toHaveBeenCalledTimes(1);
  });

  it("updates heartbeat after successful work", async () => {
    const runNext = runNextQueuedSceneArtGeneration as unknown as vi.Mock;
    runNext.mockResolvedValueOnce(makeRunNextResult("a"));
    runNext.mockResolvedValueOnce(makeRunNextResult("b"));
    runNext.mockResolvedValue({ promptHash: null });

    await workerLoop.startSceneArtWorkerLoop({ batchSize: 5, maxIterations: 1 });
    const health = await workerLoop.getSceneArtWorkerHealth();

    expect(health.lastProcessedCount).toBe(2);
    expect(typeof health.lastDurationMs).toBe("number");
    expect(health.lastBatchAt).not.toBeNull();
  });

  it("updates heartbeat on idle ticks", async () => {
    const runNext = runNextQueuedSceneArtGeneration as unknown as vi.Mock;
    runNext.mockResolvedValue({ promptHash: null });

    await workerLoop.startSceneArtWorkerLoop({ batchSize: 3, intervalMs: 1, maxIterations: 1 });
    const health = await workerLoop.getSceneArtWorkerHealth();

    expect(health.lastBatchAt).not.toBeNull();
    expect(health.lastProcessedCount).toBe(0);
  });

  it("records reclaimedCount when stale leases are reclaimed", async () => {
    const runNext = runNextQueuedSceneArtGeneration as unknown as vi.Mock;
    runNext.mockResolvedValueOnce(makeRunNextResult("reclaimed"));
    runNext.mockResolvedValue({ promptHash: null });
    reclaimStaleSceneArtMock.mockResolvedValueOnce({ reclaimedCount: 2, promptHashes: ["reclaimed"] });

    await workerLoop.startSceneArtWorkerLoop({ batchSize: 1, maxIterations: 1 });
    const health = await workerLoop.getSceneArtWorkerHealth();

    expect(health.lastBatchSummary?.reclaimedCount).toBe(2);
  });

  it("records failedCount when batches error", async () => {
    const runNext = runNextQueuedSceneArtGeneration as unknown as vi.Mock;
    runNext.mockRejectedValue(new Error("boom"));

    await workerLoop.startSceneArtWorkerLoop({ batchSize: 1, intervalMs: 1, maxIterations: 1 });
    const health = await workerLoop.getSceneArtWorkerHealth();

    expect(health.lastBatchSummary?.failedCount).toBe(1);
  });

  it("continues after a batch error", async () => {
    const runNext = runNextQueuedSceneArtGeneration as unknown as vi.Mock;
    runNext.mockRejectedValue(new Error("boom"));

    await workerLoop.startSceneArtWorkerLoop({ batchSize: 2, intervalMs: 1, maxIterations: 1 });
    const health = await workerLoop.getSceneArtWorkerHealth();

    expect(health.lastErrorMessage).toBe("boom");
    expect(health.lastErrorAt).not.toBeNull();
  });

  it("does not start new batch when paused", async () => {
    await workerLoop.pauseSceneArtWorker();
    const controller = new AbortController();
    const runNext = vi.spyOn(workerLoop, "runSceneArtWorkerBatch");
    setTimeout(() => controller.abort(), 20);

    await workerLoop.startSceneArtWorkerLoop({ batchSize: 1, intervalMs: 5, signal: controller.signal });
    expect(runNext).not.toHaveBeenCalled();
  });

  it("resumes processing after resume is called", async () => {
    await workerLoop.pauseSceneArtWorker();
    await workerLoop.resumeSceneArtWorker();
    const runNext = runNextQueuedSceneArtGeneration as unknown as vi.Mock;
    runNext.mockResolvedValueOnce(makeRunNextResult("resumed"));
    runNext.mockResolvedValue({ promptHash: null });

    await workerLoop.startSceneArtWorkerLoop({ batchSize: 1, maxIterations: 1 });
    const health = await workerLoop.getSceneArtWorkerHealth();
    expect(health.lastProcessedCount).toBeGreaterThan(0);
  });

  it("does not interrupt in-flight batch when pause triggered", async () => {
    const runNext = runNextQueuedSceneArtGeneration as unknown as vi.Mock;
    runNext.mockImplementation(async () => {
      await workerLoop.pauseSceneArtWorker();
      return { promptHash: "inflight" };
    });
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 20);

    await workerLoop.startSceneArtWorkerLoop({ batchSize: 1, maxIterations: 2, signal: controller.signal });
    const health = await workerLoop.getSceneArtWorkerHealth();
    expect(health.lastProcessedCount).toBeGreaterThan(0);
  });

  it("persists a batch summary after work completes", async () => {
    const runNext = runNextQueuedSceneArtGeneration as unknown as vi.Mock;
    runNext.mockResolvedValueOnce(makeRunNextResult("summary"));
    runNext.mockResolvedValue({ promptHash: null });

    await workerLoop.startSceneArtWorkerLoop({ batchSize: 1, maxIterations: 1 });
    const health = await workerLoop.getSceneArtWorkerHealth();

    expect(health.lastBatchSummary).not.toBeNull();
    expect(health.lastBatchSummary?.processedCount).toBe(1);
    expect(health.lastBatchSummary?.idle).toBe(false);
    expect(health.lastBatchSummary?.batchId).toMatch(/^batch:/);
  });

  it("tracks batch cost and billable attempts", async () => {
    const runNext = runNextQueuedSceneArtGeneration as unknown as vi.Mock;
    runNext.mockResolvedValueOnce(makeRunNextResult("alpha", 2));
    runNext.mockResolvedValueOnce(makeRunNextResult("beta", 3));
    runNext.mockResolvedValue({ promptHash: null });

    await workerLoop.startSceneArtWorkerLoop({ batchSize: 5, maxIterations: 1 });
    const health = await workerLoop.getSceneArtWorkerHealth();

    expect(health.lastBatchSummary?.batchCostUsd).toBe(5);
    expect(health.lastBatchSummary?.billableAttempts).toBe(2);
  });

  it("records summary even for idle batches", async () => {
    const runNext = runNextQueuedSceneArtGeneration as unknown as vi.Mock;
    runNext.mockResolvedValue({ promptHash: null });

    await workerLoop.startSceneArtWorkerLoop({ batchSize: 1, intervalMs: 1, maxIterations: 1 });
    const health = await workerLoop.getSceneArtWorkerHealth();

    expect(health.lastBatchSummary).not.toBeNull();
    expect(health.lastBatchSummary?.processedCount).toBe(0);
    expect(health.lastBatchSummary?.idle).toBe(true);
  });

  it("keeps batch cost in sync with recent history", async () => {
    const runNext = runNextQueuedSceneArtGeneration as unknown as vi.Mock;
    runNext.mockResolvedValueOnce(makeRunNextResult("cache", 4));
    runNext.mockResolvedValue({ promptHash: null });

    await workerLoop.startSceneArtWorkerLoop({ batchSize: 1, maxIterations: 1 });
    const health = await workerLoop.getSceneArtWorkerHealth();
    const summary = health.lastBatchSummary;
    const history = health.recentBatchHistory;

    expect(summary).not.toBeNull();
    expect(history.length).toBeGreaterThanOrEqual(1);
    const lastHistory = history[history.length - 1];
    expect(lastHistory.batchCostUsd).toBe(summary?.batchCostUsd);
    expect(lastHistory.billableAttempts).toBe(summary?.billableAttempts);
  });

  it("emits matching batch start/completion events", async () => {
    const runNext = runNextQueuedSceneArtGeneration as unknown as vi.Mock;
    runNext.mockResolvedValueOnce(makeRunNextResult("sync"));
    runNext.mockResolvedValue({ promptHash: null });

    await workerLoop.startSceneArtWorkerLoop({ batchSize: 1, maxIterations: 1 });
    const logs = getSceneArtLogs();
    const started = logs.find((entry) => entry.event === "scene.art.batch_started");
    const completed = logs.find((entry) => entry.event === "scene.art.batch_completed");

    expect(started).toBeDefined();
    expect(completed).toBeDefined();
    expect(started?.payload.batchId).toBe(completed?.payload.batchId);
    expect(completed?.payload.processedCount).toBe(1);
  });
});
