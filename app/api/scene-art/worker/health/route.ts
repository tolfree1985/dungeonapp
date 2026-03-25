import { NextResponse } from "next/server";
import { getSceneArtWorkerHealth } from "@/lib/scene-art/workerLoop";

export async function GET() {
  const health = await getSceneArtWorkerHealth();
  return NextResponse.json(health);
}
