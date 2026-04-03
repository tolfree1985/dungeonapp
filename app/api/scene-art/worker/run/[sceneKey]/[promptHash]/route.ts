import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runQueuedSceneArtGeneration } from "@/lib/scene-art/runQueuedSceneArtGeneration";
import { SceneArtStatus } from "@/generated/prisma";

export async function POST(
  request: Request,
  context: { params: Promise<{ sceneKey: string; promptHash: string }> },
) {
  const { sceneKey, promptHash } = await context.params;
  console.log("scene.art.worker.route.start", { sceneKey, promptHash });

  const row = await prisma.sceneArt.findUnique({
    where: {
      sceneKey_promptHash: {
        sceneKey,
        promptHash,
      },
    },
    select: { status: true, sceneKey: true, promptHash: true },
  });

  console.log("scene.art.worker.route.row", {
    promptHash,
    sceneKey,
    row,
  });

  if (!row) {
    console.log("scene.art.worker.route.no_row", { sceneKey, promptHash });
    return NextResponse.json({ promptHash: null, reason: "no_row" });
  }

  const runnable =
    row.status === SceneArtStatus.queued ||
    row.status === SceneArtStatus.retryable;

  if (!runnable) {
    console.log("scene.art.worker.route.not_runnable", {
      sceneKey,
      promptHash,
      status: row.status,
    });
    return NextResponse.json({
      promptHash: null,
      reason: "not_runnable",
      status: row.status,
    });
  }

  if (!row.sceneKey) {
    throw new Error("SCENE_ART_INVALID_IDENTITY: missing sceneKey");
  }

  console.log("scene.art.worker.route.before_run", {
    sceneKey,
    promptHash,
    status: row.status,
  });

  const result = await runQueuedSceneArtGeneration({
    sceneKey: row.sceneKey,
    promptHash: row.promptHash,
  });

  console.log("scene.art.worker.route.result", {
    promptHash: row.promptHash,
    sceneKey: row.sceneKey,
    result,
  });

  return NextResponse.json({ promptHash });
}
