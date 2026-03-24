import { resumeSceneArtWorker, getSceneArtWorkerHealth } from "@/lib/scene-art/workerLoop";

export async function POST() {
  resumeSceneArtWorker();
  return Response.json(getSceneArtWorkerHealth());
}
