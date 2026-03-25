import { describe, it, vi, expect, beforeEach } from "vitest";

const mockPrisma = {
  sceneArtWorkerState: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
};

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

const mockRow = {
  id: "scene-art-worker",
  paused: false,
  draining: false,
  running: false,
  startedAt: null,
  lastTickAt: null,
  lastBatchAt: null,
  lastProcessedCount: 0,
  lastDurationMs: null,
  lastErrorAt: null,
  lastErrorMessage: null,
};

const { workerStateStore } = await import("@/lib/scene-art/workerStateStore");

describe("sceneArtWorkerStateStore", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("creates the singleton row on first read", async () => {
    mockPrisma.sceneArtWorkerState.findUnique.mockResolvedValue(null);
    mockPrisma.sceneArtWorkerState.create.mockResolvedValue(mockRow);

    const control = await workerStateStore.getControl();

    expect(mockPrisma.sceneArtWorkerState.findUnique).toHaveBeenCalled();
    expect(mockPrisma.sceneArtWorkerState.create).toHaveBeenCalledWith({ data: { id: "scene-art-worker" } });
    expect(control).toEqual({ paused: false, draining: false });
  });

  it("persists paused/draining updates", async () => {
    mockPrisma.sceneArtWorkerState.findUnique.mockResolvedValue(mockRow);

    await workerStateStore.setControl({ paused: true });

    expect(mockPrisma.sceneArtWorkerState.update).toHaveBeenCalledWith({
      where: { id: "scene-art-worker" },
      data: { paused: true },
    });
  });

  it("updates health fields incrementally", async () => {
    mockPrisma.sceneArtWorkerState.findUnique.mockResolvedValue(mockRow);

    await workerStateStore.updateHealth({ running: true, lastTickAt: "2026-01-01T00:00:00.000Z" });

    expect(mockPrisma.sceneArtWorkerState.update).toHaveBeenCalledWith({
      where: { id: "scene-art-worker" },
      data: {
        running: true,
        lastTickAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
  });

  it("resetHealth clears health fields only", async () => {
    mockPrisma.sceneArtWorkerState.findUnique.mockResolvedValue(mockRow);

    await workerStateStore.resetHealth();

    expect(mockPrisma.sceneArtWorkerState.update).toHaveBeenCalledWith({
      where: { id: "scene-art-worker" },
      data: {
        running: false,
        startedAt: null,
        lastTickAt: null,
        lastBatchAt: null,
        lastProcessedCount: 0,
        lastDurationMs: null,
        lastErrorAt: null,
        lastErrorMessage: null,
      },
    });
  });
});
