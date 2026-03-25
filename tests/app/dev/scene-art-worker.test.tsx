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
  paused: false,
  draining: false,
  lastBatchSummary: null,
  recentBatchHistory: [],
};

const summaryHealth = {
  ...baseHealth,
  lastBatchSummary: {
    batchId: "batch:xyz",
    workerId: "worker-1",
    startedAt: "2026-03-23T12:05:00Z",
    completedAt: "2026-03-23T12:05:07Z",
    processedCount: 2,
    claimedCount: 2,
    failedCount: 0,
    reclaimedCount: 1,
    idle: false,
  },
  recentBatchHistory: [
    {
      batchId: "batch:xyz",
      workerId: "worker-1",
      startedAt: "2026-03-23T12:05:00Z",
      completedAt: "2026-03-23T12:05:07Z",
      processedCount: 2,
      claimedCount: 2,
      failedCount: 0,
      reclaimedCount: 1,
      idle: false,
    },
  ],
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

  it("shows the latest batch summary when available", async () => {
    (fetch as unknown as vi.Mock).mockImplementation((url: string) => {
      if (url === "/api/scene-art/worker/queue") {
        return Promise.resolve({ json: () => Promise.resolve({ rows: [queuedRow], autoReclaimedCount: 0 }) });
      }
      if (url === "/api/scene-art/worker/health") {
        return Promise.resolve({ json: () => Promise.resolve(summaryHealth) });
      }
      return Promise.resolve({});
    });

    render(<SceneArtWorkerPage />);
    const panel = await screen.findByTestId("latest-batch-panel");
    expect(within(panel).getByTestId("latest-batch-id").textContent).toContain("batch:xyz");
    expect(within(panel).getByTestId("latest-batch-worker").textContent).toContain("worker-1");
    expect(within(panel).getByTestId("latest-batch-processed").textContent).toContain("2");
    expect(within(panel).getByTestId("latest-batch-idle").textContent).toContain("No");
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

  it("shows a requeue button for failed rows", async () => {
    const failedRow = {
      sceneKey: "dock_house",
      promptHash: "failed-hash",
      status: "failed",
      attemptCount: 3,
      generationStartedAt: null,
      generationLeaseUntil: null,
      updatedAt: "2026-03-23T12:10:00Z",
      errorMessage: "provider failed",
    };

    (fetch as unknown as vi.Mock).mockImplementation((url: string) => {
      if (url === "/api/scene-art/worker/queue") {
        return Promise.resolve({ json: () => Promise.resolve({ rows: [failedRow], autoReclaimedCount: 0 }) });
      }
      if (url === "/api/scene-art/worker/health") {
        return Promise.resolve({ json: () => Promise.resolve(baseHealth) });
      }
      if (url === "/api/scene-art/worker/requeue") {
        return Promise.resolve({ json: () => Promise.resolve({ ok: true }) });
      }
      return Promise.resolve({});
    });

    render(<SceneArtWorkerPage />);
    const button = await screen.findByRole("button", { name: "Requeue" });
    expect(button).toBeTruthy();
    button.click();
    await waitFor(() =>
      expect((fetch as unknown as vi.Mock).mock.calls.some((call) => call[0] === "/api/scene-art/worker/requeue")).toBe(true),
    );
  });

  it("renders row diagnostics", async () => {
    const failedRow = {
      sceneKey: "dock_house",
      promptHash: "diag-hash",
      status: "failed",
      attemptCount: 3,
      generationStartedAt: "2026-03-23T12:05:00Z",
      generationLeaseUntil: "2026-03-23T12:06:00Z",
      updatedAt: "2026-03-23T12:07:00Z",
      leaseOwnerId: "worker-1",
      leaseAcquiredAt: "2026-03-23T12:04:50Z",
      lastRecoveredAt: "2026-03-23T12:03:00Z",
      createdAt: "2026-03-23T12:00:00Z",
      errorMessage: null,
    };

    (fetch as unknown as vi.Mock).mockImplementation((url: string) => {
      if (url === "/api/scene-art/worker/queue") {
        return Promise.resolve({ json: () => Promise.resolve({ rows: [failedRow], autoReclaimedCount: 0 }) });
      }
      if (url === "/api/scene-art/worker/health") {
        return Promise.resolve({ json: () => Promise.resolve(baseHealth) });
      }
      if (url === "/api/scene-art/worker/requeue") {
        return Promise.resolve({ json: () => Promise.resolve({ ok: true }) });
      }
      return Promise.resolve({});
    });

    render(<SceneArtWorkerPage />);
    const toggle = await screen.findByRole("button", { name: "Show details" });
    toggle.click();
    await waitFor(() => expect(screen.getByText(/Lease owner: worker-1/)).toBeTruthy());
    expect(screen.getByText(/Lease expires:/)).toBeTruthy();
  });

  it("shows signal badges", async () => {
    const now = new Date();
    const expiredRow = {
      sceneKey: "dock_harbor",
      promptHash: "signal-hash",
      status: "generating",
      attemptCount: 1,
      generationStartedAt: null,
      generationLeaseUntil: new Date(now.getTime() - 1000).toISOString(),
      updatedAt: now.toISOString(),
      leaseOwnerId: "worker-1",
      lastRecoveredAt: null,
      createdAt: now.toISOString(),
      errorMessage: null,
    };
    (fetch as unknown as vi.Mock).mockImplementation((url: string) => {
      if (url === "/api/scene-art/worker/queue") {
        return Promise.resolve({ json: () => Promise.resolve({ rows: [expiredRow], autoReclaimedCount: 0 }) });
      }
      if (url === "/api/scene-art/worker/health") {
        return Promise.resolve({ json: () => Promise.resolve(baseHealth) });
      }
      return Promise.resolve({});
    });

    render(<SceneArtWorkerPage />);
    await waitFor(() => expect(screen.getByText("Lease Expired")).toBeTruthy());
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
    await waitFor(() => expect(screen.getByText("Status: Running")).toBeTruthy());
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

  it("shows pause button when worker is active", async () => {
    (fetch as unknown as vi.Mock).mockImplementation((url: string) => {
      if (url === "/api/scene-art/worker/queue") {
        return Promise.resolve({ json: () => Promise.resolve({ rows: [queuedRow], autoReclaimedCount: 0 }) });
      }
      if (url === "/api/scene-art/worker/health") {
        return Promise.resolve({ json: () => Promise.resolve({ ...baseHealth, paused: false }) });
      }
      return Promise.resolve({});
    });

    render(<SceneArtWorkerPage />);
    await waitFor(() => expect(screen.getByText("Pause worker")).toBeTruthy());
  });

  it("shows resume button when worker is paused", async () => {
    (fetch as unknown as vi.Mock).mockImplementation((url: string) => {
      if (url === "/api/scene-art/worker/queue") {
        return Promise.resolve({ json: () => Promise.resolve({ rows: [queuedRow], autoReclaimedCount: 0 }) });
      }
      if (url === "/api/scene-art/worker/health") {
        return Promise.resolve({ json: () => Promise.resolve({ ...baseHealth, paused: true }) });
      }
      return Promise.resolve({});
    });

    render(<SceneArtWorkerPage />);
    await waitFor(() => expect(screen.getByText("Resume worker")).toBeTruthy());
  });

  it("updates health panel after pause and resume", async () => {
    let paused = false;
    (fetch as unknown as vi.Mock).mockImplementation((url: string) => {
      if (url === "/api/scene-art/worker/queue") {
        return Promise.resolve({ json: () => Promise.resolve({ rows: [queuedRow], autoReclaimedCount: 0 }) });
      }
      if (url === "/api/scene-art/worker/health") {
        return Promise.resolve({ json: () => Promise.resolve({ ...baseHealth, paused, lastProcessedCount: paused ? 0 : 1 }) });
      }
      if (url === "/api/scene-art/worker/pause") {
        paused = true;
        return Promise.resolve({ json: () => Promise.resolve({ ...baseHealth, paused: true, lastProcessedCount: 0 }) });
      }
      if (url === "/api/scene-art/worker/resume") {
        paused = false;
        return Promise.resolve({ json: () => Promise.resolve({ ...baseHealth, paused: false, lastProcessedCount: 2 }) });
      }
      return Promise.resolve({});
    });

    render(<SceneArtWorkerPage />);
    const pauseButton = await screen.findByText("Pause worker");
    pauseButton.click();
    await waitFor(() => expect(screen.getByText(/Status: Paused/i)).toBeTruthy());
    const resumeButton = await screen.findByText("Resume worker");
    resumeButton.click();
    await waitFor(() => expect(screen.getByText(/Status: Running/i)).toBeTruthy());
  });

  it("shows draining status and hides pause/resume controls", async () => {
    (fetch as unknown as vi.Mock).mockImplementation((url: string) => {
      if (url === "/api/scene-art/worker/queue") {
        return Promise.resolve({ json: () => Promise.resolve({ rows: [queuedRow], autoReclaimedCount: 0 }) });
      }
      if (url === "/api/scene-art/worker/health") {
        return Promise.resolve({ json: () => Promise.resolve({ ...baseHealth, draining: true }) });
      }
      return Promise.resolve({});
    });

    render(<SceneArtWorkerPage />);
    await waitFor(() => expect(screen.getByText("Status: Draining")).toBeTruthy());
    expect(screen.queryByText("Pause worker")).toBeNull();
    expect(screen.queryByText("Resume worker")).toBeNull();
    expect(screen.queryByText(/Drain & stop/i)).toBeNull();
    expect(screen.getByText(/Draining…/)).toBeTruthy();
  });

  it("drain button calls endpoint and refreshes queue", async () => {
    let queueCalls = 0;
    (fetch as unknown as vi.Mock).mockImplementation((url: string) => {
      if (url === "/api/scene-art/worker/queue") {
        queueCalls += 1;
        return Promise.resolve({ json: () => Promise.resolve({ rows: [queuedRow], autoReclaimedCount: 0 }) });
      }
      if (url === "/api/scene-art/worker/health") {
        return Promise.resolve({ json: () => Promise.resolve(baseHealth) });
      }
      if (url === "/api/scene-art/worker/drain") {
        return Promise.resolve({ json: () => Promise.resolve({ ...baseHealth, draining: true }) });
      }
      return Promise.resolve({});
    });

    render(<SceneArtWorkerPage />);
    const drainButton = await screen.findByRole("button", { name: /Drain & stop/i });
    drainButton.click();
    await waitFor(() =>
      expect((fetch as unknown as vi.Mock).mock.calls.some((call) => call[0] === "/api/scene-art/worker/drain")).toBe(true),
    );
    await waitFor(() => expect(queueCalls).toBeGreaterThanOrEqual(2));
  });

  it("shows start button when worker stopped and triggers start endpoint", async () => {
    let queueCalls = 0;
    (fetch as unknown as vi.Mock).mockImplementation((url: string) => {
      if (url === "/api/scene-art/worker/queue") {
        queueCalls += 1;
        return Promise.resolve({ json: () => Promise.resolve({ rows: [queuedRow], autoReclaimedCount: 0 }) });
      }
      if (url === "/api/scene-art/worker/health") {
        return Promise.resolve({ json: () => Promise.resolve({ ...baseHealth, running: false }) });
      }
      if (url === "/api/scene-art/worker/start") {
        return Promise.resolve({ json: () => Promise.resolve({ ...baseHealth, running: true }) });
      }
      return Promise.resolve({});
    });

    render(<SceneArtWorkerPage />);
    const startButton = await screen.findByRole("button", { name: /Start worker/i });
    startButton.click();
    await waitFor(() =>
      expect((fetch as unknown as vi.Mock).mock.calls.some((call) => call[0] === "/api/scene-art/worker/start")).toBe(true),
    );
    await waitFor(() => expect(queueCalls).toBeGreaterThanOrEqual(2));
  });

  it("hides start button when worker already running", async () => {
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
    await waitFor(() => expect(screen.queryByRole("button", { name: /Start worker/i })).toBeNull());
  });
});
