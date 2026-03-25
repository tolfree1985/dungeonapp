import { SceneArtStatus } from "@/generated/prisma";

export type SceneArtLogPayload = {
  sceneKey: string;
  promptHash: string;
  status: SceneArtStatus;
  attemptCount?: number | null;
  generationStartedAt?: Date | null;
  generationLeaseUntil?: Date | null;
  durationMs?: number;
  errorCode?: string;
  errorMessage?: string;
  batchId?: string;
  workerId?: string;
  startedAt?: string;
  completedAt?: string;
  idle?: boolean;
  processedCount?: number;
  claimedCount?: number;
  failedCount?: number;
  reclaimedCount?: number;
  reason?: string;
};

export type SceneArtLogEntry = {
  event: string;
  payload: SceneArtLogPayload;
};

const SCENE_ART_LOG_HISTORY_KEY = Symbol.for("SCENE_ART_LOG_HISTORY");

function getSceneArtLogHistory(): SceneArtLogEntry[] {
  const globalWithLog = globalThis as unknown as Record<symbol, SceneArtLogEntry[] | undefined>;
  if (!globalWithLog[SCENE_ART_LOG_HISTORY_KEY]) {
    globalWithLog[SCENE_ART_LOG_HISTORY_KEY] = [];
  }
  return globalWithLog[SCENE_ART_LOG_HISTORY_KEY]!;
}

export function logSceneArtEvent(event: string, payload: SceneArtLogPayload) {
  getSceneArtLogHistory().push({ event, payload });
  console.info(event, payload);
}

export function getSceneArtLogs() {
  return [...getSceneArtLogHistory()];
}

export function resetSceneArtLogs() {
  const history = getSceneArtLogHistory();
  history.length = 0;
}
