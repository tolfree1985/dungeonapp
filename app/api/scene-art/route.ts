import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildSceneArtPromptInput, buildScenePrompt } from "@/lib/sceneArtGenerator";
import type { SceneArtStatusRecord } from "@/lib/sceneArtStatus";
import { resolveCanonicalSceneIdentity } from "@/lib/scene-art/resolveCanonicalSceneIdentity";

export async function GET(request: NextRequest) {
  const sceneKey = request.nextUrl.searchParams.get("sceneKey");
  if (!sceneKey) {
    return NextResponse.json(
      { ok: false, sceneArt: null, error: "sceneKey query parameter is required" },
      { status: 400 }
    );
  }

  const promptHash = request.nextUrl.searchParams.get("promptHash");
  if (!promptHash) {
    return NextResponse.json(
      {
        ok: false,
        sceneArt: null,
        error: "promptHash query parameter is required",
      },
      { status: 400 }
    );
  }

  const identity = resolveCanonicalSceneIdentity({
    sceneKey,
    promptHash,
  });

  if (!identity.sceneKey || !identity.promptHash) {
    return NextResponse.json(
      {
        ok: false,
        sceneArt: null,
        error: "Scene art identity incomplete",
      },
      { status: 400 }
    );
  }

  const row = await prisma.sceneArt.findFirst({
    where: {
      sceneKey: identity.sceneKey,
      promptHash: identity.promptHash,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!row) {
    return NextResponse.json(
      { ok: false, sceneArt: null, error: "Scene art not found" },
      { status: 404 }
    );
  }

  console.log("scene.art.api.lookup", {
    requestedSceneKey: identity.sceneKey,
    requestedPromptHash: identity.promptHash,
    returnedSceneKey: row.sceneKey ?? null,
    returnedPromptHash: row.promptHash ?? null,
    returnedStatus: row.status ?? null,
    returnedImageUrl: row.imageUrl ?? null,
  });

  if (row.sceneKey !== identity.sceneKey || row.promptHash !== identity.promptHash) {
    console.error("scene.art.api.identity.mismatch", {
      requested: { sceneKey: identity.sceneKey, promptHash: identity.promptHash },
      returned: { sceneKey: row.sceneKey, promptHash: row.promptHash },
    });
    return NextResponse.json(
      {
        ok: false,
        sceneArt: null,
        status: "invalid",
        sceneKey: identity.sceneKey,
        promptHash: identity.promptHash,
        imageUrl: null,
      },
      { status: 400 }
    );
  }

  const rowIdentity = resolveCanonicalSceneIdentity(row);
  const sceneArt: SceneArtStatusRecord = {
    sceneKey: rowIdentity.sceneKey ?? row.sceneKey,
    promptHash: rowIdentity.promptHash ?? row.promptHash ?? null,
    status: row.status,
    imageUrl: row.imageUrl,
  };

  return NextResponse.json({ ok: true, sceneArt });
}
