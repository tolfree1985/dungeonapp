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

  it("renders rows, action buttons, and refresh control", async () => {
    (fetch as unknown as vi.Mock).mockImplementation((url: string) => {
      if (url === "/api/scene-art/worker/queue") {
        return Promise.resolve({ json: () => Promise.resolve([queuedRow]) });
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
      Promise.resolve({
        json: () => Promise.resolve([queuedRow]),
      }),
    );
    (fetch as unknown as vi.Mock).mockImplementation((url: string) => {
      if (url === "/api/scene-art/worker/queue") {
        return queueCalls();
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
        return Promise.resolve({ json: () => Promise.resolve([queuedRow]) });
      }
      if (url === "/api/scene-art/worker/run-next") {
        return Promise.resolve({});
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
        return Promise.resolve({ json: () => Promise.resolve([queuedRow]) });
      }
      if (url.startsWith("/api/scene-art/worker/run/")) {
        return Promise.resolve({});
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
        return Promise.resolve({ json: () => Promise.resolve([detailedRow]) });
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
        return Promise.resolve({ json: () => Promise.resolve([queuedRow, staleRow, failedRow]) });
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
      Promise.resolve({ json: () => Promise.resolve([queuedRow]) }),
    );
    (fetch as unknown as vi.Mock).mockImplementation((url: string) => {
      if (url === "/api/scene-art/worker/queue") {
        return queueCalls();
      }
      if (url === "/api/scene-art/worker/reclaim-stale") {
        return Promise.resolve({ json: () => Promise.resolve({ reclaimedCount: 1, promptHashes: ["hash"] }) });
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
});
