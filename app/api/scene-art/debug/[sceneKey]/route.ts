import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: { sceneKey: string } },
) {
  const sceneKey = params.sceneKey;
  const promptHash = request.nextUrl.searchParams.get("promptHash");
  if (!promptHash) {
    return NextResponse.json({ error: "Missing promptHash" }, { status: 400 });
  }

  const row = await prisma.sceneArt.findUnique({
    where: {
      sceneKey_promptHash: {
        sceneKey,
        promptHash,
      },
    },
  });

  if (!row) {
    return NextResponse.json({ error: "Scene art not found" }, { status: 404 });
  }

  return NextResponse.json({
    sceneKey: row.sceneKey,
    promptHash: row.promptHash,
    status: row.status,
    imageUrl: row.imageUrl,
    attemptCount: row.attemptCount,
    generationStartedAt: row.generationStartedAt,
    generationLeaseUntil: row.generationLeaseUntil,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    tagsJson: row.tagsJson,
  });
}
