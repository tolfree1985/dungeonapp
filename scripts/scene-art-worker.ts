import { runWorkerProcess } from "@/lib/scene-art/runWorkerProcess";

const batchSize = Number(process.env.SCENE_ART_WORKER_BATCH_SIZE ?? "3");
const intervalMs = Number(process.env.SCENE_ART_WORKER_INTERVAL_MS ?? "2000");

async function main() {
  const worker = runWorkerProcess({ batchSize, intervalMs });

  const shutdown = () => {
    worker.stop();
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  try {
    await worker.done;
  } catch (error) {
    console.error("scene.art.worker.external.crashed", error);
    process.exit(1);
  }
}

main();
