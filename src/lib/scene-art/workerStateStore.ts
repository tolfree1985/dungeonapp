import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";

const SCENE_ART_WORKER_STATE_ID = "scene-art-worker";

export type SceneArtWorkerControlState = {
  paused: boolean;
  draining: boolean;
};

export type SceneArtWorkerHealthState = {
  running: boolean;
  paused: boolean;
  draining: boolean;
  startedAt: string | null;
  lastTickAt: string | null;
  lastBatchAt: string | null;
  lastProcessedCount: number;
  lastDurationMs: number | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
  lastBatchSummary: SceneArtWorkerBatchSummary | null;
};

export type SceneArtWorkerBatchSummary = {
  batchId: string;
  workerId: string;
  startedAt: string;
  completedAt: string;
  processedCount: number;
  claimedCount: number;
  failedCount: number;
  reclaimedCount: number;
  idle: boolean;
};

type SceneArtWorkerStateRow = {
  id: string;
  paused: boolean;
  draining: boolean;
  running: boolean;
  startedAt: Date | null;
  lastTickAt: Date | null;
  lastBatchAt: Date | null;
  lastProcessedCount: number;
  lastDurationMs: number | null;
  lastErrorAt: Date | null;
  lastErrorMessage: string | null;
  lastBatchSummary: Prisma.Json | null;
};

async function ensureStateRow(): Promise<SceneArtWorkerStateRow> {
  let state = await prisma.sceneArtWorkerState.findUnique({
    where: { id: SCENE_ART_WORKER_STATE_ID },
  });
  if (!state) {
    state = await prisma.sceneArtWorkerState.create({
      data: { id: SCENE_ART_WORKER_STATE_ID },
    });
  }
  return state;
}

function mapRowToHealth(row: SceneArtWorkerStateRow): SceneArtWorkerHealthState {
  return {
    running: row.running,
    paused: row.paused,
    draining: row.draining,
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    lastTickAt: row.lastTickAt ? row.lastTickAt.toISOString() : null,
    lastBatchAt: row.lastBatchAt ? row.lastBatchAt.toISOString() : null,
    lastProcessedCount: row.lastProcessedCount,
    lastDurationMs: row.lastDurationMs,
    lastErrorAt: row.lastErrorAt ? row.lastErrorAt.toISOString() : null,
    lastErrorMessage: row.lastErrorMessage,
    lastBatchSummary: row.lastBatchSummary
      ? (row.lastBatchSummary as SceneArtWorkerBatchSummary)
      : null,
  };
}

export const workerStateStore = {
  async getControl(): Promise<SceneArtWorkerControlState> {
    const state = await ensureStateRow();
    return { paused: state.paused, draining: state.draining };
  },

  async setControl(next: Partial<SceneArtWorkerControlState>): Promise<void> {
    await prisma.sceneArtWorkerState.update({
      where: { id: SCENE_ART_WORKER_STATE_ID },
      data: next,
    });
  },

  async getHealth(): Promise<SceneArtWorkerHealthState> {
    const state = await ensureStateRow();
    return mapRowToHealth(state);
  },

  async updateHealth(next: Partial<SceneArtWorkerHealthState>): Promise<void> {
    const data: Record<string, unknown> = {};
    if (typeof next.running === "boolean") data.running = next.running;
    if (typeof next.paused === "boolean") data.paused = next.paused;
    if (typeof next.draining === "boolean") data.draining = next.draining;
    if (next.startedAt !== undefined) data.startedAt = next.startedAt ? new Date(next.startedAt) : null;
    if (next.lastTickAt !== undefined) data.lastTickAt = next.lastTickAt ? new Date(next.lastTickAt) : null;
    if (next.lastBatchAt !== undefined) data.lastBatchAt = next.lastBatchAt ? new Date(next.lastBatchAt) : null;
    if (typeof next.lastProcessedCount === "number") data.lastProcessedCount = next.lastProcessedCount;
    if (next.lastDurationMs !== undefined) data.lastDurationMs = next.lastDurationMs;
    if (next.lastErrorAt !== undefined) data.lastErrorAt = next.lastErrorAt ? new Date(next.lastErrorAt) : null;
    if (next.lastErrorMessage !== undefined) data.lastErrorMessage = next.lastErrorMessage;
    if (next.lastBatchSummary !== undefined) data.lastBatchSummary = next.lastBatchSummary;

    if (Object.keys(data).length === 0) return;

    await prisma.sceneArtWorkerState.update({
      where: { id: SCENE_ART_WORKER_STATE_ID },
      data,
    });
  },

  async resetHealth(): Promise<void> {
    await prisma.sceneArtWorkerState.update({
      where: { id: SCENE_ART_WORKER_STATE_ID },
      data: {
        running: false,
        startedAt: null,
        lastTickAt: null,
        lastBatchAt: null,
        lastProcessedCount: 0,
        lastDurationMs: null,
        lastErrorAt: null,
        lastErrorMessage: null,
        lastBatchSummary: null,
      },
    });
  },
};
