import { runWorkerProcess } from "@/lib/scene-art/runWorkerProcess";

async function main() {
  const worker = runWorkerProcess();

  try {
    await worker.done;
  } catch (error) {
    console.error("scene.art.worker.external.crashed", error);
    process.exit(1);
  }
}

main();
