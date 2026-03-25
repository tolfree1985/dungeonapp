import { getSceneArtWorkerRuntimeConfig } from "@/lib/scene-art/workerRuntimeConfig";

let cachedWorkerId: string | null = null;

export function getSceneArtWorkerId() {
  if (cachedWorkerId) {
    return cachedWorkerId;
  }

  const runtimeOverride = getSceneArtWorkerRuntimeConfig().workerIdOverride?.trim();
  if (runtimeOverride) {
    cachedWorkerId = runtimeOverride;
    return cachedWorkerId;
  }

  const envOverride = process.env.SCENE_ART_WORKER_ID?.trim();
  if (envOverride) {
    cachedWorkerId = envOverride;
    return cachedWorkerId;
  }

  const pid = typeof process !== "undefined" ? process.pid : 0;
  const bootTs = Date.now();
  cachedWorkerId = `scene-art:${pid}:${bootTs}`;
  return cachedWorkerId;
}

export function resetSceneArtWorkerId() {
  cachedWorkerId = null;
}
