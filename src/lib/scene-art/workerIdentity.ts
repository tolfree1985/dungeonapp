let cachedWorkerId: string | null = null;

export function getSceneArtWorkerId() {
  if (cachedWorkerId) {
    return cachedWorkerId;
  }

  const override = process.env.SCENE_ART_WORKER_ID?.trim();
  if (override) {
    cachedWorkerId = override;
    return cachedWorkerId;
  }

  const pid = typeof process !== "undefined" ? process.pid : 0;
  const bootTs = Date.now();
  cachedWorkerId = `scene-art:${pid}:${bootTs}`;
  return cachedWorkerId;
}
