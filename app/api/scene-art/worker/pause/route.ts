import { pauseSceneArtWorker, getSceneArtWorkerHealth } from "@/lib/scene-art/workerLoop";

export async function POST() {
  pauseSceneArtWorker();
  return Response.json(getSceneArtWorkerHealth());
}
