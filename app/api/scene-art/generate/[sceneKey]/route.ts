import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildScenePrompt, buildPromptHash, buildSceneArtPromptInput, SceneArtPromptInput, generateImage } from "@/lib/sceneArtGenerator";
import { SceneArtStatus } from "@/generated/prisma";

function parseQueryParams(request: Request) {
  const url = new URL(request.url);
  return {
    sceneText: url.searchParams.get("sceneText"),
    locationKey: url.searchParams.get("locationKey"),
    timeKey: url.searchParams.get("timeKey"),
    stylePreset: url.searchParams.get("stylePreset") ?? undefined,
    engineVersion: url.searchParams.get("engineVersion") ?? undefined,
  };
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ sceneKey: string }> },
) {
  const { sceneKey } = await context.params;
  const force = request.nextUrl.searchParams.get("force") === "true";
  if (force) {
    await prisma.sceneArt.deleteMany({ where: { sceneKey } });
  }
  const query = parseQueryParams(request);
  const decodedSceneText = query.sceneText ? decodeURIComponent(query.sceneText) : null;
  const promptInput: SceneArtPromptInput = {
    sceneKey,
    sceneText: decodedSceneText ?? "",
    locationKey: query.locationKey ?? null,
    timeKey: query.timeKey ?? null,
    stylePreset: query.stylePreset ?? null,
    engineVersion: query.engineVersion ?? null,
  };
  const prompt = buildScenePrompt(promptInput);
  const promptHash = prompt.promptHash;
  const uniqueWhere = {
    sceneKey_promptHash: {
      sceneKey,
      promptHash,
    },
  };
  const existing = await prisma.sceneArt.findUnique({
    where: uniqueWhere,
  });
  if (existing?.status === SceneArtStatus.ready && existing.imageUrl) {
    return NextResponse.json({
      ...existing,
      promptHash,
      provider: "remote",
    });
  }
  if (existing?.status === SceneArtStatus.queued) {
    if (existing.imageUrl) {
      return NextResponse.json({
        ...existing,
        provider: "pending",
      });
    }
    console.log("[scene-art] continuing generation for pending row", { sceneKey });
  }

  const row = await prisma.sceneArt.upsert({
    where: uniqueWhere,
    update: {},
    create: {
      sceneKey,
      promptHash,
      status: SceneArtStatus.queued,
      title: sceneKey,
      basePrompt: "",
      renderPrompt: "",
      imageUrl: null,
      tagsJson: JSON.stringify({ provider: "queued" }),
    },
  });

  if (row.status === SceneArtStatus.ready && row.imageUrl) {
    return NextResponse.json({
      ...row,
      promptHash,
      provider: "pending",
    });
  }

  console.log("sceneArt.generate.call", {
    sceneKey,
    providerUrl: process.env.IMAGE_PROVIDER_URL ?? null,
    promptHash,
  });
  const generated = await generateImage(prompt.renderPrompt, sceneKey, promptHash);

  const updated = await prisma.sceneArt.update({
    where: uniqueWhere,
    data: {
      imageUrl: generated.imageUrl,
      status: SceneArtStatus.ready,
      basePrompt: prompt.basePrompt,
      renderPrompt: prompt.renderPrompt,
      tagsJson: JSON.stringify({ provider: generated.provider }),
    },
  });

  return NextResponse.json({
    ...updated,
    promptHash,
    provider: generated.provider,
  });
}
