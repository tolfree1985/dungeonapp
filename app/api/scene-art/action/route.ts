import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SceneArtStatus, type RenderMode } from "@/generated/prisma";
import { queueSceneArtGeneration } from "@/lib/scene-art/queueSceneArtGeneration";
import { sceneArtFileExists } from "@/lib/scene-art/fileSystem";
import { deleteSceneArtFileIfPresent } from "@/lib/scene-art/deleteSceneArtFileIfPresent";
import { SceneArtRecoveryError } from "@/lib/scene-art/recoverSceneArt";

type SceneArtActionBody = {
  action: "retry" | "force-regenerate" | "clear-and-regenerate";
  sceneKey: string;
  promptHash: string;
  sceneText: string;
  stylePreset?: string | null;
  renderMode?: RenderMode;
  autoProcess?: boolean;
};

export async function POST(request: NextRequest) {
  const body = (await request.json()) as SceneArtActionBody;
  if (!body.sceneKey || !body.promptHash) {
    return NextResponse.json(
      { error: "SCENE_ART_ACTION_IDENTITY_REQUIRED", message: "Scene key and prompt hash are required" },
      { status: 400 },
    );
  }

  const row = await prisma.sceneArt.findUnique({
    where: {
      sceneKey_promptHash: {
        sceneKey: body.sceneKey,
        promptHash: body.promptHash,
      },
    },
  });

  if (!row) {
    return NextResponse.json(
      { error: "SCENE_ART_ACTION_ROW_NOT_FOUND", message: "Scene art row not found" },
      { status: 404 },
    );
  }

  const now = new Date();
  const isFailed = row.status === SceneArtStatus.failed;
  const isReady = row.status === SceneArtStatus.ready;
  const isGenerating = row.status === SceneArtStatus.generating;
  const missingFile = isReady && (!row.imageUrl || !(await sceneArtFileExists(row.imageUrl)));
  const isStaleGenerating = isGenerating && (!row.generationLeaseUntil || row.generationLeaseUntil.getTime() <= now.getTime());
  const isMissing = missingFile || isStaleGenerating;

  if (body.action === "retry" && !isFailed && !isMissing) {
    return NextResponse.json(
      {
        error: "SCENE_ART_ACTION_INVALID_STATE",
        message: `Retry not allowed from status: ${row.status}`,
      },
      { status: 409 },
    );
  }

  if (body.action === "force-regenerate" && !isFailed && !isMissing && !isReady) {
    return NextResponse.json(
      {
        error: "SCENE_ART_ACTION_INVALID_STATE",
        message: `Force regenerate not allowed from status: ${row.status}`,
      },
      { status: 409 },
    );
  }

  if (body.action === "clear-and-regenerate" && !isFailed && !isMissing && !isReady) {
    return NextResponse.json(
      {
        error: "SCENE_ART_ACTION_INVALID_STATE",
        message: `Clear and regenerate not allowed from status: ${row.status}`,
      },
      { status: 409 },
    );
  }

  if (body.action === "clear-and-regenerate" && row.imageUrl) {
    await deleteSceneArtFileIfPresent(row.imageUrl);
  }

  try {
    const result = await queueSceneArtGeneration(
      {
        sceneKey: row.sceneKey,
        sceneText: body.sceneText ?? "",
        stylePreset: body.stylePreset ?? row.stylePreset ?? "victorian-gothic-cinematic",
        renderMode: body.renderMode ?? row.renderMode,
        engineVersion: row.engineVersion ?? null,
      },
      { force: true, autoProcess: body.autoProcess },
    );
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof SceneArtRecoveryError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: error.status });
    }
    console.error("scene.art.action.error", {
      sceneKey: body.sceneKey,
      promptHash: body.promptHash,
      action: body.action,
      error,
    });
    return NextResponse.json(
      { error: "SCENE_ART_ACTION_FAILED", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
