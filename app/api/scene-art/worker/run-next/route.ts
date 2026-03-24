import { NextResponse } from "next/server";
import { runNextQueuedSceneArtGeneration } from "@/lib/scene-art/runNextQueuedSceneArtGeneration";
import { autoReclaimStaleSceneArt } from "@/lib/scene-art/reclaimStaleSceneArt";

export async function POST() {
  await autoReclaimStaleSceneArt({ limit: 10 });
  const result = await runNextQueuedSceneArtGeneration();
  return NextResponse.json(result);
}
