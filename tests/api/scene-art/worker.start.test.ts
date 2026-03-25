import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST as startWorker } from "@/app/api/scene-art/worker/start/route";
import * as workerLoop from "@/lib/scene-art/workerLoop";

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

beforeEach(() => {
  vi.clearAllMocks();
  storeStateRef.current = makeDefaultState();
  workerLoop.resetSceneArtWorkerHealth();
});

describe("scene-art worker start", () => {

  it("starts the worker and returns a runnable health snapshot", async () => {
    const startSpy = vi.spyOn(workerLoop, "startSceneArtWorkerBackground").mockResolvedValue();

    const response = await startWorker();
    const body = await response.json();

    expect(startSpy).toHaveBeenCalledTimes(1);
    expect(body.running).toBe(true);
    expect(body.paused).toBe(false);
    expect(body.draining).toBe(false);
  });

  it("returns runnable health even when already marked running", async () => {
    const startSpy = vi.spyOn(workerLoop, "startSceneArtWorkerBackground").mockResolvedValue();
    storeStateRef.current.control = { paused: true, draining: true };
    storeStateRef.current.health = {
      ...storeStateRef.current.health,
      running: true,
      paused: true,
      draining: true,
    };

    const response = await startWorker();
    const body = await response.json();

    expect(startSpy).toHaveBeenCalledTimes(1);
    expect(body.running).toBe(true);
    expect(body.paused).toBe(false);
    expect(body.draining).toBe(false);
  });
});
