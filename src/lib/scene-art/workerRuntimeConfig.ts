export type SceneArtWorkerRuntimeConfig = {
  batchSize: number;
  intervalMs: number;
  leaseMs: number;
  workerIdOverride?: string;
};

const DEFAULT_CONFIG: SceneArtWorkerRuntimeConfig = {
  batchSize: 3,
  intervalMs: 2000,
  leaseMs: 60_000,
};

let cachedConfig: SceneArtWorkerRuntimeConfig | null = null;

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }
  return fallback;
}

export function resetSceneArtWorkerRuntimeConfig() {
  cachedConfig = null;
}

export function getSceneArtWorkerRuntimeConfig(): SceneArtWorkerRuntimeConfig {
  if (!cachedConfig) {
    cachedConfig = {
      batchSize: parsePositiveInt(process.env.SCENE_ART_WORKER_BATCH_SIZE, DEFAULT_CONFIG.batchSize),
      intervalMs: parsePositiveInt(process.env.SCENE_ART_WORKER_INTERVAL_MS, DEFAULT_CONFIG.intervalMs),
      leaseMs: parsePositiveInt(process.env.SCENE_ART_WORKER_LEASE_MS, DEFAULT_CONFIG.leaseMs),
      workerIdOverride: process.env.SCENE_ART_WORKER_ID?.trim() || undefined,
    };
  }
  return cachedConfig;
}

export function overrideSceneArtWorkerRuntimeConfig(overrides: Partial<SceneArtWorkerRuntimeConfig>) {
  cachedConfig = {
    ...getSceneArtWorkerRuntimeConfig(),
    ...overrides,
  };
}
