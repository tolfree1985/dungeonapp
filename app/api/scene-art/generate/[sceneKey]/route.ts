import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SceneArtStatus } from "@/generated/prisma";
import { generateImage } from "@/lib/sceneArtGenerator";
import { loadOrCreateSceneArt } from "@/lib/scene-art/loadOrCreateSceneArt";

const FAILURE_COOLDOWN_MS = 60_000;

function parseQueryParams(request: NextRequest) {
  return {
    sceneText: request.nextUrl.searchParams.get("sceneText") ?? null,
    stylePreset: request.nextUrl.searchParams.get("stylePreset") ?? null,
    engineVersion: request.nextUrl.searchParams.get("engineVersion") ?? null,
    force: request.nextUrl.searchParams.get("force") === "true",
  };
}

function shouldThrottleFailed(row: { status: SceneArtStatus; updatedAt: Date }) {
  return row.status === SceneArtStatus.failed && Date.now() - row.updatedAt.getTime() < FAILURE_COOLDOWN_MS;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ sceneKey: string }> },
) {
  const { sceneKey } = await context.params;
  const query = parseQueryParams(request);
  const { identity, row } = await loadOrCreateSceneArt({
    sceneKey,
    sceneText: query.sceneText,
    stylePreset: query.stylePreset,
    engineVersion: query.engineVersion,
    renderMode: "full",
  });
  const promptHash = identity.promptHash;
  const uniqueWhere = {
    sceneKey_promptHash: {
      sceneKey: identity.sceneKey,
      promptHash,
    },
  };

  const shouldReturnCached = !query.force && (row.status === SceneArtStatus.ready || row.status === SceneArtStatus.queued);
  if (shouldReturnCached) {
    return NextResponse.json(row);
  }
  if (query.force && row.status === SceneArtStatus.generating) {
    return NextResponse.json(row);
  }
  if (!query.force && shouldThrottleFailed(row)) {
    return NextResponse.json(row);
  }

  await prisma.sceneArt.update({
    where: uniqueWhere,
    data: {
      status: SceneArtStatus.queued,
    },
  });

  try {
    const generated = await generateImage(identity.prompt.renderPrompt, identity.sceneKey, promptHash);
    const updated = await prisma.sceneArt.update({
      where: uniqueWhere,
      data: {
        imageUrl: generated.imageUrl,
        status: SceneArtStatus.ready,
        basePrompt: identity.basePrompt,
        renderPrompt: identity.renderPrompt,
        tagsJson: JSON.stringify({ provider: generated.provider }),
      },
    });
    return NextResponse.json(updated);
  } catch (error) {
    await prisma.sceneArt.update({
      where: uniqueWhere,
      data: {
        status: SceneArtStatus.failed,
      },
    });
    const failed = await prisma.sceneArt.findUniqueOrThrow({ where: uniqueWhere });
    return NextResponse.json(failed, { status: 502 });
  }
}
