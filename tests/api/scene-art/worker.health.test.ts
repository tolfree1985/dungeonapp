import { describe, it, expect, vi, afterEach } from "vitest";
import { GET } from "@/app/api/scene-art/worker/health/route";
import * as workerLoop from "@/lib/scene-art/workerLoop";
import { runNextQueuedSceneArtGeneration } from "@/lib/scene-art/runNextQueuedSceneArtGeneration";

vi.mock("@/lib/scene-art/runNextQueuedSceneArtGeneration", () => ({
  runNextQueuedSceneArtGeneration: vi.fn().mockResolvedValue({ promptHash: null }),
}));

describe("scene-art worker health", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    workerLoop.resetSceneArtWorkerHealth();
  });

  it("health endpoint returns the latest snapshot", async () => {
    const runNext = runNextQueuedSceneArtGeneration as unknown as vi.Mock;
    runNext.mockResolvedValueOnce({ promptHash: "x" });
    runNext.mockResolvedValue({ promptHash: null });

    await workerLoop.startSceneArtWorkerLoop({ batchSize: 1, maxIterations: 1 });
    const response = await GET();
    const body = await response.json();

    expect(body).toHaveProperty("running");
    expect(body.lastProcessedCount).toBe(1);
    expect(typeof body.lastDurationMs).toBe("number");
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
    runNext.mockResolvedValueOnce({ promptHash: "y" });
    runNext.mockResolvedValue({ promptHash: null });

    await workerLoop.startSceneArtWorkerLoop({ batchSize: 1, maxIterations: 1 });
    const before = workerLoop.getSceneArtWorkerHealth();
    await GET();
    const after = workerLoop.getSceneArtWorkerHealth();

    expect(after).toEqual(before);
  });
});
