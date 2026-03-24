import { describe, it, expect, vi, afterEach } from "vitest";
import * as workerLoop from "@/lib/scene-art/workerLoop";
import { runNextQueuedSceneArtGeneration } from "@/lib/scene-art/runNextQueuedSceneArtGeneration";

vi.mock("@/lib/scene-art/runNextQueuedSceneArtGeneration", () => ({
  runNextQueuedSceneArtGeneration: vi.fn(),
}));

describe("scene art worker loop", () => {
  afterEach(() => {
    vi.resetAllMocks();
    workerLoop.resetSceneArtWorkerHealth();
  });

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
    const health = workerLoop.getSceneArtWorkerHealth();

    expect(health.lastProcessedCount).toBe(2);
    expect(typeof health.lastDurationMs).toBe("number");
    expect(health.lastBatchAt).not.toBeNull();
  });

  it("updates heartbeat on idle ticks", async () => {
    const runNext = runNextQueuedSceneArtGeneration as unknown as vi.Mock;
    runNext.mockResolvedValue({ promptHash: null });

    await workerLoop.startSceneArtWorkerLoop({ batchSize: 3, intervalMs: 1, maxIterations: 1 });
    const health = workerLoop.getSceneArtWorkerHealth();

    expect(health.lastBatchAt).not.toBeNull();
    expect(health.lastProcessedCount).toBe(0);
  });

  it("continues after a batch error", async () => {
    const runNext = runNextQueuedSceneArtGeneration as unknown as vi.Mock;
    runNext.mockRejectedValue(new Error("boom"));

    await workerLoop.startSceneArtWorkerLoop({ batchSize: 2, intervalMs: 1, maxIterations: 1 });
    const health = workerLoop.getSceneArtWorkerHealth();

    expect(health.lastErrorMessage).toBe("boom");
    expect(health.lastErrorAt).not.toBeNull();
  });
});
  it("does not start new batch when paused", async () => {
    workerLoop.pauseSceneArtWorker();
    const controller = new AbortController();
    const runNext = vi.spyOn(workerLoop, "runSceneArtWorkerBatch");
    setTimeout(() => controller.abort(), 20);

    await workerLoop.startSceneArtWorkerLoop({ batchSize: 1, intervalMs: 5, signal: controller.signal });
    expect(runNext).not.toHaveBeenCalled();
  });

  it("resumes processing after resume is called", async () => {
    workerLoop.pauseSceneArtWorker();
    workerLoop.resumeSceneArtWorker();
    const runNext = runNextQueuedSceneArtGeneration as unknown as vi.Mock;
    runNext.mockResolvedValueOnce({ promptHash: "resumed" });
    runNext.mockResolvedValue({ promptHash: null });

    await workerLoop.startSceneArtWorkerLoop({ batchSize: 1, maxIterations: 1 });
    const health = workerLoop.getSceneArtWorkerHealth();
    expect(health.lastProcessedCount).toBeGreaterThan(0);
  });

  it("does not interrupt in-flight batch when pause triggered", async () => {
    const runNext = runNextQueuedSceneArtGeneration as unknown as vi.Mock;
    runNext.mockImplementation(async () => {
      workerLoop.pauseSceneArtWorker();
      return { promptHash: "inflight" };
    });
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 20);

    await workerLoop.startSceneArtWorkerLoop({ batchSize: 1, maxIterations: 2, signal: controller.signal });
    const health = workerLoop.getSceneArtWorkerHealth();
    expect(health.lastProcessedCount).toBeGreaterThan(0);
  });
