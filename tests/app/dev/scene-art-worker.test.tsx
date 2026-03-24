import { describe, it, vi, beforeEach, afterEach, expect } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import SceneArtWorkerPage from "@/app/dev/scene-art-worker/page";

global.fetch = vi.fn();

describe("Scene Art Worker", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  const queuedRow = {
    sceneKey: "dock_office",
    promptHash: "hash",
    status: "queued",
    attemptCount: 0,
    generationStartedAt: null,
    generationLeaseUntil: null,
    updatedAt: null,
    errorMessage: null,
  };

  const baseHealth = {
    running: true,
    startedAt: "2026-03-23T12:00:00Z",
    lastTickAt: "2026-03-23T12:01:00Z",
    lastBatchAt: "2026-03-23T12:02:00Z",
    lastProcessedCount: 1,
    lastDurationMs: 5,
    lastErrorAt: null,
    lastErrorMessage: null,
  };

  it("renders rows, action buttons, and refresh control", async () => {
    (fetch as unknown as vi.Mock).mockImplementation((url: string) => {
      if (url === "/api/scene-art/worker/queue") {
        return Promise.resolve({ json: () => Promise.resolve({ rows: [queuedRow], autoReclaimedCount: 0 }) });
      }
      if (url === "/api/scene-art/worker/health") {
        return Promise.resolve({ json: () => Promise.resolve(baseHealth) });
      }
      return Promise.resolve({});
    });

    render(<SceneArtWorkerPage />);

    await waitFor(() => expect(screen.getByText("Scene Art Worker")).toBeTruthy());
    expect(screen.getAllByRole("button", { name: "Run next" })[0]).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Refresh queue" })[0]).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Run this" })[0]).toBeTruthy();
  });

  it("refresh button reloads queue data", async () => {
    const queueCalls = vi.fn(() =>
      Promise.resolve({ json: () => Promise.resolve({ rows: [queuedRow], autoReclaimedCount: 0 }) }),
    );
    (fetch as unknown as vi.Mock).mockImplementation((url: string) => {
      if (url === "/api/scene-art/worker/queue") {
        return queueCalls();
      }
      if (url === "/api/scene-art/worker/health") {
        return Promise.resolve({ json: () => Promise.resolve(baseHealth) });
      }
      return Promise.resolve({});
    });

    render(<SceneArtWorkerPage />);
    await waitFor(() => expect(queueCalls).toHaveBeenCalledTimes(1));
    screen.getAllByRole("button", { name: "Refresh queue" })[0].click();
    await waitFor(() => expect(queueCalls).toHaveBeenCalledTimes(2));
  });

  it("run next refreshes the queue after success", async () => {
    let queueCount = 0;
    (fetch as unknown as vi.Mock).mockImplementation((url: string) => {
      if (url === "/api/scene-art/worker/queue") {
        queueCount += 1;
        return Promise.resolve({ json: () => Promise.resolve({ rows: [queuedRow], autoReclaimedCount: 0 }) });
      }
      if (url === "/api/scene-art/worker/run-next") {
        return Promise.resolve({});
      }
      if (url === "/api/scene-art/worker/health") {
        return Promise.resolve({ json: () => Promise.resolve(baseHealth) });
      }
      return Promise.resolve({});
    });

    render(<SceneArtWorkerPage />);
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Run next" })[0]).toBeTruthy());
    screen.getAllByRole("button", { name: "Run next" })[0].click();
    await waitFor(() =>
      expect((fetch as unknown as vi.Mock).mock.calls.some((call) => call[0] === "/api/scene-art/worker/run-next")).toBe(true),
    );
    await waitFor(() => expect(queueCount).toBeGreaterThanOrEqual(2));
  });

  it("run this refreshes the queue and calls the targeted endpoint", async () => {
    let queueCount = 0;
    (fetch as unknown as vi.Mock).mockImplementation((url: string) => {
      if (url === "/api/scene-art/worker/queue") {
        queueCount += 1;
        return Promise.resolve({ json: () => Promise.resolve({ rows: [queuedRow], autoReclaimedCount: 0 }) });
      }
      if (url.startsWith("/api/scene-art/worker/run/")) {
        return Promise.resolve({});
      }
      if (url === "/api/scene-art/worker/health") {
        return Promise.resolve({ json: () => Promise.resolve(baseHealth) });
      }
      return Promise.resolve({});
    });

    render(<SceneArtWorkerPage />);
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Run this" })[0]).toBeTruthy());
    screen.getAllByRole("button", { name: "Run this" })[0].click();
    await waitFor(() =>
      expect((fetch as unknown as vi.Mock).mock.calls.some((call) => call[0] === "/api/scene-art/worker/run/hash")).toBe(true),
    );
    await waitFor(() => expect(queueCount).toBeGreaterThanOrEqual(2));
  });

  it("renders attempt count, lease metadata, and error details", async () => {
    const detailedRow = {
      sceneKey: "dock_office",
      promptHash: "hash",
      status: "queued",
      attemptCount: 5,
      generationStartedAt: null,
      generationLeaseUntil: "2026-03-23T12:00:00Z",
      updatedAt: "2026-03-23T12:01:00Z",
      errorMessage: "provider failed",
    };

    (fetch as unknown as vi.Mock).mockImplementation((url: string) => {
      if (url === "/api/scene-art/worker/queue") {
        return Promise.resolve({ json: () => Promise.resolve({ rows: [detailedRow], autoReclaimedCount: 0 }) });
      }
      if (url === "/api/scene-art/worker/health") {
        return Promise.resolve({ json: () => Promise.resolve(baseHealth) });
      }
      return Promise.resolve({});
    });

    render(<SceneArtWorkerPage />);
    const row = await screen.findByTestId("worker-row-hash");
    expect(within(row).getByText("dock_office")).toBeTruthy();
    expect(within(row).getByText("5")).toBeTruthy();
    expect(within(row).getByText("provider failed")).toBeTruthy();
  });

  it("hides run this for non-queued rows", async () => {
    (fetch as unknown as vi.Mock).mockImplementation((url: string) => {
      if (url === "/api/scene-art/worker/queue") {
        return Promise.resolve({
          json: () =>
            Promise.resolve([
              {
                sceneKey: "dock_office",
                promptHash: "hash",
                status: "generating",
                attemptCount: 0,
                generationStartedAt: null,
                generationLeaseUntil: null,
                updatedAt: null,
              },
            ]),
        });
      }
      if (url === "/api/scene-art/worker/health") {
        return Promise.resolve({ json: () => Promise.resolve(baseHealth) });
      }
      return Promise.resolve({});
    });
    render(<SceneArtWorkerPage />);
    await waitFor(() => expect(screen.queryAllByRole("button", { name: "Run this" })).toHaveLength(0));
  });

  it("marks stale generating rows with a badge and updates stats", async () => {
    const staleRow = {
      sceneKey: "dock_office",
      promptHash: "stale-row",
      status: "generating",
      attemptCount: 1,
      generationStartedAt: null,
      generationLeaseUntil: new Date(Date.now() - 60_000).toISOString(),
      updatedAt: new Date().toISOString(),
      errorMessage: null,
    };
    const failedRow = {
      sceneKey: "dock_office",
      promptHash: "failed-row",
      status: "failed",
      attemptCount: 0,
      generationStartedAt: null,
      generationLeaseUntil: null,
      updatedAt: new Date().toISOString(),
      errorMessage: "failed reason",
    };
    (fetch as unknown as vi.Mock).mockImplementation((url: string) => {
      if (url === "/api/scene-art/worker/queue") {
        return Promise.resolve({ json: () => Promise.resolve({ rows: [queuedRow, staleRow, failedRow], autoReclaimedCount: 0 }) });
      }
      if (url === "/api/scene-art/worker/health") {
        return Promise.resolve({ json: () => Promise.resolve(baseHealth) });
      }
      return Promise.resolve({});
    });

    render(<SceneArtWorkerPage />);
    const row = await screen.findByTestId("worker-row-stale-row");
    expect(within(row).getByText("Stale")).toBeTruthy();
    expect(screen.getByText("Stale: 1")).toBeTruthy();
    expect(screen.getByText("Failed: 1")).toBeTruthy();
  });

  it("reclaim stale button refreshes queue after success", async () => {
    const queueCalls = vi.fn(() =>
      Promise.resolve({ json: () => Promise.resolve({ rows: [queuedRow], autoReclaimedCount: 0 }) }),
    );
    (fetch as unknown as vi.Mock).mockImplementation((url: string) => {
      if (url === "/api/scene-art/worker/queue") {
        return queueCalls();
      }
      if (url === "/api/scene-art/worker/reclaim-stale") {
        return Promise.resolve({ json: () => Promise.resolve({ reclaimedCount: 1, promptHashes: ["hash"] }) });
      }
      if (url === "/api/scene-art/worker/health") {
        return Promise.resolve({ json: () => Promise.resolve(baseHealth) });
      }
      return Promise.resolve({});
    });

    render(<SceneArtWorkerPage />);
    await waitFor(() => expect(queueCalls).toHaveBeenCalledTimes(1));
    screen.getByRole("button", { name: "Reclaim stale jobs" }).click();
    await waitFor(() => expect((fetch as unknown as vi.Mock).mock.calls.some((call) => call[0] === "/api/scene-art/worker/reclaim-stale")).toBe(true));
    await waitFor(() => expect(queueCalls).toHaveBeenCalledTimes(2));
    expect(screen.getByText("Reclaimed 1 job(s)")).toBeTruthy();
  });

  it("run batch button sends limit and refreshes queue", async () => {
    const queueCalls = vi.fn(() =>
      Promise.resolve({ json: () => Promise.resolve({ rows: [queuedRow], autoReclaimedCount: 0 }) }),
    );
    (fetch as unknown as vi.Mock).mockImplementation((url: string, opts?: RequestInit) => {
      if (url === "/api/scene-art/worker/queue") {
        return queueCalls();
      }
      if (url === "/api/scene-art/worker/run-batch") {
        const body = opts?.body ? JSON.parse(opts.body.toString()) : {};
        expect(body.limit).toBe(3);
        return Promise.resolve({ json: () => Promise.resolve({ processedCount: 3, processedPromptHashes: ["hash"] }) });
      }
      return Promise.resolve({});
    });

    render(<SceneArtWorkerPage />);
    await waitFor(() => expect(queueCalls).toHaveBeenCalledTimes(1));
    screen.getByRole("button", { name: "Run batch" }).click();
    await waitFor(() => expect(queueCalls).toHaveBeenCalledTimes(2));
  });

  it("shows auto-reclaimed label when queue reports automation", async () => {
    (fetch as unknown as vi.Mock).mockImplementation((url: string) => {
      if (url === "/api/scene-art/worker/queue") {
        return Promise.resolve({ json: () => Promise.resolve({ rows: [queuedRow], autoReclaimedCount: 2 }) });
      }
      return Promise.resolve({});
    });

    render(<SceneArtWorkerPage />);
    expect(await screen.findByText("Auto-reclaimed 2 job(s)")).toBeTruthy();
  });

  it("renders worker health summary", async () => {
    const healthPayload = { ...baseHealth, lastProcessedCount: 2, lastErrorMessage: null };
    (fetch as unknown as vi.Mock).mockImplementation((url: string) => {
      if (url === "/api/scene-art/worker/queue") {
        return Promise.resolve({ json: () => Promise.resolve({ rows: [queuedRow], autoReclaimedCount: 0 }) });
      }
      if (url === "/api/scene-art/worker/health") {
        return Promise.resolve({ json: () => Promise.resolve(healthPayload) });
      }
      return Promise.resolve({});
    });

    render(<SceneArtWorkerPage />);
    await waitFor(() => expect(screen.getByText("Worker Health")).toBeTruthy());
    expect(screen.getByText("Status: Running")).toBeTruthy();
    expect(screen.getByText("Last Processed: 2")).toBeTruthy();
  });

  it("shows error state when lastErrorMessage exists", async () => {
    const errorHealth = { ...baseHealth, lastErrorMessage: "boom", lastErrorAt: "2026-03-23T12:05:00Z" };
    (fetch as unknown as vi.Mock).mockImplementation((url: string) => {
      if (url === "/api/scene-art/worker/queue") {
        return Promise.resolve({ json: () => Promise.resolve({ rows: [queuedRow], autoReclaimedCount: 0 }) });
      }
      if (url === "/api/scene-art/worker/health") {
        return Promise.resolve({ json: () => Promise.resolve(errorHealth) });
      }
      return Promise.resolve({});
    });

    render(<SceneArtWorkerPage />);
    await waitFor(() => expect(screen.getByText("Status: Error")).toBeTruthy());
    expect(screen.getByText("Error: boom")).toBeTruthy();
  });

  it("shows idle state when no recent batch processed", async () => {
    const idleHealth = { ...baseHealth, lastBatchAt: null, lastProcessedCount: 0 };
    (fetch as unknown as vi.Mock).mockImplementation((url: string) => {
      if (url === "/api/scene-art/worker/queue") {
        return Promise.resolve({ json: () => Promise.resolve({ rows: [queuedRow], autoReclaimedCount: 0 }) });
      }
      if (url === "/api/scene-art/worker/health") {
        return Promise.resolve({ json: () => Promise.resolve(idleHealth) });
      }
      return Promise.resolve({});
    });

    render(<SceneArtWorkerPage />);
    await waitFor(() => expect(screen.getByText("Status: Idle")).toBeTruthy());
    expect(screen.getByText("Last Processed: 0")).toBeTruthy();
  });

  it("renders last tick, batch, and processed count from health endpoint", async () => {
    const healthPayload = {
      ...baseHealth,
      lastTickAt: "2026-03-23T12:10:00Z",
      lastBatchAt: "2026-03-23T12:11:00Z",
      lastProcessedCount: 4,
    };
    (fetch as unknown as vi.Mock).mockImplementation((url: string) => {
      if (url === "/api/scene-art/worker/queue") {
        return Promise.resolve({ json: () => Promise.resolve({ rows: [queuedRow], autoReclaimedCount: 0 }) });
      }
      if (url === "/api/scene-art/worker/health") {
        return Promise.resolve({ json: () => Promise.resolve(healthPayload) });
      }
      return Promise.resolve({});
    });

    render(<SceneArtWorkerPage />);
    await waitFor(() => expect(screen.getByText("Last Processed: 4")).toBeTruthy());
    expect(screen.getByText(/Last Tick:/)).toBeTruthy();
    expect(screen.getByText(/Last Batch:/)).toBeTruthy();
  });
});
