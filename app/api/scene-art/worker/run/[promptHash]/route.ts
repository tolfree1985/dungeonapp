import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runQueuedSceneArtGeneration } from "@/lib/scene-art/runQueuedSceneArtGeneration";
import { SceneArtStatus } from "@/generated/prisma";

export async function POST(
  request: Request,
  context: { params: Promise<{ promptHash: string }> },
) {
  const { promptHash } = await context.params;

  const row = await prisma.sceneArt.findFirst({
    where: { promptHash },
    select: { status: true },
  });

  if (!row) {
    return NextResponse.json({ promptHash: null });
  }

  if (row.status !== SceneArtStatus.queued) {
    return NextResponse.json({ promptHash: null });
  }

  await runQueuedSceneArtGeneration(promptHash);
  return NextResponse.json({ promptHash });
}
