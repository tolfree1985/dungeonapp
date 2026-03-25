import { beforeEach, describe, expect, it, vi } from "vitest";

const startMock = vi.fn();
const getConfigMock = vi.fn(() => ({
  batchSize: 3,
  intervalMs: 2000,
  leaseMs: 60000,
  workerIdOverride: undefined,
}));

vi.mock("@/lib/scene-art/workerLoop", () => ({
  startSceneArtWorkerLoop: (...params: unknown[]) => startMock(...params as never),
}));

vi.mock("@/lib/scene-art/workerRuntimeConfig", () => ({
  getSceneArtWorkerRuntimeConfig: () => getConfigMock(),
}));

vi.mock("@/lib/scene-art/workerIdentity", () => ({
  getSceneArtWorkerId: () => "worker-identity",
}));

const { runWorkerProcess } = await import("@/lib/scene-art/runWorkerProcess");

function defer() {
  let resolve: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve: resolve! };
}

describe("runWorkerProcess", () => {
  beforeEach(() => {
    startMock.mockReset();
    getConfigMock.mockReturnValue({
      batchSize: 3,
      intervalMs: 2000,
      leaseMs: 60000,
      workerIdOverride: undefined,
    });
  });

  it("boots the worker loop with runtime config defaults", async () => {
    const d = defer();
    startMock.mockImplementation(({ signal }: { signal?: AbortSignal }) => {
      signal?.addEventListener("abort", () => d.resolve());
      return d.promise;
    });

    const worker = runWorkerProcess();
    worker.stop();
    await worker.done;

    expect(startMock).toHaveBeenCalled();
    const callArgs = startMock.mock.calls[0][0];
    expect(callArgs.batchSize).toBe(3);
    expect(callArgs.intervalMs).toBe(2000);
  });

  it("respects runtime config overrides", async () => {
    const d = defer();
    getConfigMock.mockReturnValue({
      batchSize: 6,
      intervalMs: 5000,
      leaseMs: 120000,
      workerIdOverride: "override-id",
    });
    startMock.mockImplementation(({ signal }: { signal?: AbortSignal }) => {
      signal?.addEventListener("abort", () => d.resolve());
      return d.promise;
    });

    const worker = runWorkerProcess({});
    worker.stop();
    await worker.done;

    const callArgs = startMock.mock.calls[0][0];
    expect(callArgs.batchSize).toBe(6);
    expect(callArgs.intervalMs).toBe(5000);
  });
});
