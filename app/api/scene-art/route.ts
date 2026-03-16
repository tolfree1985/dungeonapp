import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { SceneArtStatusRecord } from "@/lib/sceneArtStatus";

export async function GET(request: NextRequest) {
  const sceneKey = request.nextUrl.searchParams.get("sceneKey");
  if (!sceneKey) {
    return NextResponse.json(
      { ok: false, sceneArt: null, error: "sceneKey query parameter is required" },
      { status: 400 }
    );
  }

  const row = await prisma.sceneArt.findUnique({
    where: { sceneKey },
  });

  if (!row) {
    return NextResponse.json(
      { ok: false, sceneArt: null, error: "Scene art not found" },
      { status: 404 }
    );
  }

  const sceneArt: SceneArtStatusRecord = {
    sceneKey: row.sceneKey,
    status: row.status,
    imageUrl: row.imageUrl,
  };

  return NextResponse.json({ ok: true, sceneArt });
}
