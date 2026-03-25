import { NextResponse } from "next/server";
import { drainSceneArtWorker, getSceneArtWorkerHealth } from "@/lib/scene-art/workerLoop";

export async function POST() {
  await drainSceneArtWorker();
  const health = await getSceneArtWorkerHealth();
  return NextResponse.json(health);
}
