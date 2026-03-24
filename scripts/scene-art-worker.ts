import { startSceneArtWorkerLoop } from "@/lib/scene-art/workerLoop";

const batchSize = Number(process.env.SCENE_ART_WORKER_BATCH_SIZE ?? "3");
const intervalMs = Number(process.env.SCENE_ART_WORKER_INTERVAL_MS ?? "2000");

const controller = new AbortController();

const shutdown = () => {
  controller.abort();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

startSceneArtWorkerLoop({ batchSize, intervalMs, signal: controller.signal }).catch((error) => {
  console.error("scene.art.worker.crashed", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
