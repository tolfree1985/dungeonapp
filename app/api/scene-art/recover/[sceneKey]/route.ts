import { NextRequest, NextResponse } from "next/server";
import {
  recoverSceneArt,
  SceneArtRecoveryError,
} from "@/lib/scene-art/recoverSceneArt";

type RecoverBody = {
  action: "retry";
  sceneText: string;
  stylePreset?: string | null;
  renderMode?: "full" | "preview";
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sceneKey: string }> },
) {
  const { sceneKey } = await context.params;
  const body = (await request.json()) as RecoverBody;

  try {
    const result = await recoverSceneArt({
      action: body.action,
      sceneKey,
      sceneText: body.sceneText,
      stylePreset: body.stylePreset ?? null,
      renderMode: body.renderMode ?? "full",
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof SceneArtRecoveryError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.status },
      );
    }

    return NextResponse.json(
      {
        error: "SCENE_ART_RECOVERY_UNKNOWN",
        message: error instanceof Error ? error.message : "Unknown recovery error",
      },
      { status: 500 },
    );
  }
}
