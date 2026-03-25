import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/scene-art/worker/health/route";
import { POST as pauseWorker } from "@/app/api/scene-art/worker/pause/route";
import { POST as resumeWorker } from "@/app/api/scene-art/worker/resume/route";
import { POST as drainWorker } from "@/app/api/scene-art/worker/drain/route";
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
      lastBatchSummary: null,
      recentBatchHistory: [],
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
  runNextQueuedSceneArtGeneration: vi.fn().mockResolvedValue({ promptHash: null }),
}));

vi.mock("@/lib/scene-art/reclaimStaleSceneArt", () => ({
  reclaimStaleSceneArt: vi.fn(async () => ({ reclaimedCount: 0, promptHashes: [] })),
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

beforeEach(() => {
  vi.clearAllMocks();
  storeStateRef.current = makeDefaultState();
  workerLoop.resetSceneArtWorkerHealth();
});

describe("scene-art worker health", () => {

  it("health endpoint returns the latest snapshot", async () => {
    const runNext = runNextQueuedSceneArtGeneration as unknown as vi.Mock;
    runNext.mockResolvedValueOnce(makeRunNextResult("x"));
    runNext.mockResolvedValue({ promptHash: null });

    await workerLoop.startSceneArtWorkerLoop({ batchSize: 1, maxIterations: 1 });
    const response = await GET();
    const body = await response.json();

    expect(body).toHaveProperty("running");
    expect(body.lastProcessedCount).toBe(1);
    expect(typeof body.lastDurationMs).toBe("number");
    expect(body.paused).toBe(false);
  });

  it("includes last error details after a batch failure", async () => {
    const runNext = runNextQueuedSceneArtGeneration as unknown as vi.Mock;
    runNext.mockRejectedValue(new Error("boom"));

    await workerLoop.startSceneArtWorkerLoop({ batchSize: 1, intervalMs: 1, maxIterations: 1 });
    const response = await GET();
    const body = await response.json();

    expect(body.lastErrorMessage).toBe("boom");
    expect(body.lastErrorAt).not.toBeNull();
  });

  it("does not mutate worker state when reading health", async () => {
    const runNext = runNextQueuedSceneArtGeneration as unknown as vi.Mock;
    runNext.mockResolvedValueOnce(makeRunNextResult("y"));
    runNext.mockResolvedValue({ promptHash: null });

    await workerLoop.startSceneArtWorkerLoop({ batchSize: 1, maxIterations: 1 });
    const before = await workerLoop.getSceneArtWorkerHealth();
    await GET();
    const after = await workerLoop.getSceneArtWorkerHealth();

    expect(after).toEqual(before);
  });

  it("pause endpoint sets paused true", async () => {
    const response = await pauseWorker();
    const body = await response.json();
    expect(body.paused).toBe(true);
  });

  it("resume endpoint sets paused false", async () => {
    await workerLoop.pauseSceneArtWorker();
    const response = await resumeWorker();
    const body = await response.json();
    expect(body.paused).toBe(false);
  });

  it("drain endpoint sets draining true", async () => {
    const response = await drainWorker();
    const body = await response.json();
    expect(body.draining).toBe(true);
  });
});
