import { pauseSceneArtWorker, getSceneArtWorkerHealth } from "@/lib/scene-art/workerLoop";

export async function POST() {
  await pauseSceneArtWorker();
  const health = await getSceneArtWorkerHealth();
  return Response.json(health);
}
