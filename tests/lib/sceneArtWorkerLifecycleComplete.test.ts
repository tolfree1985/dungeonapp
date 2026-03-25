import { describe, it, expect, vi, beforeEach } from "vitest";
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
    setControl: vi.fn(async (next) => {
      storeStateRef.current.control = {
        ...storeStateRef.current.control,
        ...next,
      };
      storeStateRef.current.health = {
        ...storeStateRef.current.health,
        paused: storeStateRef.current.control.paused,
        draining: storeStateRef.current.control.draining,
      };
    }),
    getHealth: vi.fn(async () => ({ ...storeStateRef.current.health })),
    updateHealth: vi.fn(async (next) => {
      storeStateRef.current.health = {
        ...storeStateRef.current.health,
        ...next,
      };
    }),
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

describe("scene-art worker lifecycle smoke", () => {

  it("exercises start/pause/resume/drain/stop/restart in order", async () => {
    const runNext = runNextQueuedSceneArtGeneration as unknown as vi.Mock;
    runNext.mockResolvedValueOnce({ promptHash: "job-1" });
    runNext.mockResolvedValue({ promptHash: null });

    await workerLoop.startSceneArtWorkerLoop({ batchSize: 1, maxIterations: 1 });
    let health = await workerLoop.getSceneArtWorkerHealth();
    expect(health.lastProcessedCount).toBe(1);
    expect(health.running).toBe(false);

    workerLoop.pauseSceneArtWorker();
    expect((await workerLoop.getSceneArtWorkerHealth()).paused).toBe(true);

    workerLoop.resumeSceneArtWorker();
    expect((await workerLoop.getSceneArtWorkerHealth()).paused).toBe(false);

    runNext.mockResolvedValueOnce({ promptHash: "job-2" });
    runNext.mockResolvedValue({ promptHash: null });
    await workerLoop.startSceneArtWorkerLoop({ batchSize: 1, maxIterations: 1 });
    health = await workerLoop.getSceneArtWorkerHealth();
    expect(health.lastProcessedCount).toBe(1);

    workerLoop.drainSceneArtWorker();
    runNext.mockResolvedValue({ promptHash: null });
    await expect(workerLoop.isSceneArtWorkerDraining()).resolves.toBe(true);
    await workerLoop.startSceneArtWorkerLoop({ batchSize: 1, maxIterations: 1 });
    health = await workerLoop.getSceneArtWorkerHealth();
    expect(health.draining).toBe(true);

    runNext.mockResolvedValueOnce({ promptHash: "job-3" });
    runNext.mockResolvedValue({ promptHash: null });
    await workerLoop.startSceneArtWorkerLoop({ batchSize: 1, maxIterations: 1 });
    health = await workerLoop.getSceneArtWorkerHealth();
    expect(health.draining).toBe(true);
    expect(health.lastProcessedCount).toBe(1);
  });
});
