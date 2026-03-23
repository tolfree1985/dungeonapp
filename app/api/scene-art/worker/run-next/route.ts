import { NextResponse } from "next/server";
import { runNextQueuedSceneArtGeneration } from "@/lib/scene-art/runNextQueuedSceneArtGeneration";

export async function POST() {
  const result = await runNextQueuedSceneArtGeneration();
  return NextResponse.json(result);
}
