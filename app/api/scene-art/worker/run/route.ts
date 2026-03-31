import { NextResponse } from "next/server";
import { runNextQueuedSceneArtGeneration } from "@/lib/scene-art/runNextQueuedSceneArtGeneration";

export async function POST() {
  console.log("scene.art.worker.run.start");
  let processed = 0;
  let iteration = 0;

  while (true) {
    iteration++;
    console.log("scene.art.worker.run.iteration.begin", { iteration });
    const result = await runNextQueuedSceneArtGeneration();
    console.log("scene.art.worker.run.iteration.result", { iteration, result });
    if (!result.sceneKey && !result.promptHash) break;
    processed++;
  }

  return NextResponse.json({ processed });
}
