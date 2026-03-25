import { beforeEach, describe, expect, it, vi } from "vitest";
import * as workerLoop from "@/lib/scene-art/workerLoop";
import { runNextQueuedSceneArtGeneration } from "@/lib/scene-art/runNextQueuedSceneArtGeneration";

const { storeStateRef, workerStateStoreMock, makeDefaultState } = vi.hoisted(() => {
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

  return {
    storeStateRef,
    workerStateStoreMock,
    makeDefaultState,
  };
});

vi.mock("@/lib/scene-art/workerStateStore", () => ({
  workerStateStore: workerStateStoreMock,
}));

vi.mock("@/lib/scene-art/runNextQueuedSceneArtGeneration", () => ({
  runNextQueuedSceneArtGeneration: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  storeStateRef.current = makeDefaultState();
  workerLoop.resetSceneArtWorkerHealth();
});

describe("scene art worker loop", () => {
  it("processes up to batch size and returns prompt hashes", async () => {
    const runNext = runNextQueuedSceneArtGeneration as unknown as vi.Mock;
    runNext.mockResolvedValueOnce({ promptHash: "a" });
    runNext.mockResolvedValueOnce({ promptHash: "b" });
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
    runNext.mockResolvedValueOnce({ promptHash: "a" });
    runNext.mockResolvedValueOnce({ promptHash: "b" });
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
    runNext.mockResolvedValueOnce({ promptHash: "resumed" });
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
});
