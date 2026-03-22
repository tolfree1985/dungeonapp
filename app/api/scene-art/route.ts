import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildSceneArtPromptInput, buildScenePrompt } from "@/lib/sceneArtGenerator";
import type { SceneArtStatusRecord } from "@/lib/sceneArtStatus";

export async function GET(request: NextRequest) {
  const sceneKey = request.nextUrl.searchParams.get("sceneKey");
  if (!sceneKey) {
    return NextResponse.json(
      { ok: false, sceneArt: null, error: "sceneKey query parameter is required" },
      { status: 400 }
    );
  }

  const sceneText = request.nextUrl.searchParams.get("sceneText") ?? null;
  const locationKey = request.nextUrl.searchParams.get("locationKey") ?? null;
  const timeKey = request.nextUrl.searchParams.get("timeKey") ?? null;
  const stylePreset = request.nextUrl.searchParams.get("stylePreset") ?? null;
  const engineVersion = request.nextUrl.searchParams.get("engineVersion") ?? null;

  const promptInput = buildSceneArtPromptInput({
    sceneKey,
    currentSceneState: {
      text: sceneText,
      locationKey,
      timeKey,
    },
    stylePreset,
    engineVersion,
  });
  const prompt = buildScenePrompt(promptInput);
  const promptHash = prompt.promptHash;

  const row = await prisma.sceneArt.findUnique({
    where: {
      sceneKey_promptHash: {
        sceneKey,
        promptHash,
      },
    },
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
