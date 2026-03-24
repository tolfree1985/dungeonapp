import { NextResponse } from "next/server";
import { getSceneArtWorkerHealth } from "@/lib/scene-art/workerLoop";

export async function GET() {
  return NextResponse.json(getSceneArtWorkerHealth());
}
