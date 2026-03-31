import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sceneKey = url.searchParams.get("sceneKey");
  const promptHash = url.searchParams.get("promptHash");

  if (!sceneKey || !promptHash) {
    console.warn("SCENE_ART_LOOKUP", { sceneKey, promptHash });
    return NextResponse.json({ error: "missing identity" }, { status: 400 });
  }

  const row = await prisma.sceneArt.findUnique({
    where: {
      sceneKey_promptHash: { sceneKey, promptHash },
    },
    select: {
      sceneKey: true,
      promptHash: true,
      status: true,
      imageUrl: true,
    },
  });

  if (!row) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json(row);
}
