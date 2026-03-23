import { NextResponse } from "next/server";
import { reclaimStaleSceneArt } from "@/lib/scene-art/reclaimStaleSceneArt";

export async function POST() {
  const result = await reclaimStaleSceneArt();
  return NextResponse.json(result);
}
