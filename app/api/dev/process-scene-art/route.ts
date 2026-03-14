import { NextResponse } from "next/server";
import { processQueuedSceneArt } from "@/lib/sceneArtWorker";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const limit =
    typeof body?.limit === "number" && body.limit > 0
      ? Math.floor(body.limit)
      : 5;

  const result = await processQueuedSceneArt({ limit });

  return NextResponse.json(result);
}
