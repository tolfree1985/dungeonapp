import { describe, it, expect, vi, afterEach } from "vitest";
import * as workerLoop from "@/lib/scene-art/workerLoop";
import { runNextQueuedSceneArtGeneration } from "@/lib/scene-art/runNextQueuedSceneArtGeneration";

vi.mock("@/lib/scene-art/runNextQueuedSceneArtGeneration", () => ({
  runNextQueuedSceneArtGeneration: vi.fn(),
}));

describe("scene art worker loop", () => {
  afterEach(() => vi.restoreAllMocks());

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

});
