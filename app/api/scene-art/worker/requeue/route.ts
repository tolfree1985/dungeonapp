import { NextResponse } from "next/server";
import { requeueSceneArt } from "@/lib/scene-art/requeueSceneArt";

export async function POST(request: Request) {
  const body = await request.json();
  const { sceneKey, promptHash } = body;
  if (typeof sceneKey !== "string" || typeof promptHash !== "string") {
    return NextResponse.json({ ok: false, error: "missing identity" }, { status: 400 });
  }

  try {
    const row = await requeueSceneArt({ sceneKey, promptHash });
    return NextResponse.json({ ok: true, row });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
