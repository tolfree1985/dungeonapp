import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildScenePrompt, buildSceneArtPromptInput, generateImage } from "@/lib/sceneArtGenerator";
import { SceneArtStatus } from "@/generated/prisma";
import { getSceneArtIdentity } from "@/lib/sceneArtIdentity";

const fallbackImages = new Set(["/scene-art/dock_office.jpg", "/scene-art/generated-placeholder.jpg"]);

function isFallbackImage(imageUrl: string | null): boolean {
  return imageUrl !== null && fallbackImages.has(imageUrl);
}

function isGeneratedImage(sceneKey: string, promptHash: string, imageUrl: string | null): boolean {
  if (!imageUrl) return false;
  return imageUrl === `/scene-art/${sceneKey}-${promptHash}.png`;
}

function providerLabel(
  sceneKey: string,
  promptHash: string,
  imageUrl: string | null | undefined,
): "remote" | "fallback" {
  if (!imageUrl) return "fallback";
  if (imageUrl === "/scene-art/dock_office.jpg") return "fallback";
  if (imageUrl === "/scene-art/generated-placeholder.jpg") return "fallback";
  if (imageUrl === `/scene-art/${sceneKey}-${promptHash}.png`) return "remote";
  return "fallback";
}

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
  const identity = getSceneArtIdentity({
    sceneKey,
    sceneText: decodedSceneText,
    locationKey: query.locationKey ?? null,
    timeKey: query.timeKey ?? null,
    stylePreset: query.stylePreset ?? null,
    engineVersion: query.engineVersion ?? null,
  });
  const promptHash = identity.promptHash;
  const prompt = identity.prompt;
  const uniqueWhere = {
    sceneKey_promptHash: {
      sceneKey,
      promptHash,
    },
  };
  const existing = await prisma.sceneArt.findUnique({
    where: uniqueWhere,
  });
  if (existing && existing.status === SceneArtStatus.ready) {
    return NextResponse.json({
      ...existing,
      promptHash,
      provider: providerLabel(sceneKey, promptHash, existing.imageUrl ?? null),
    });
  }
  if (existing && existing.status === SceneArtStatus.generating) {
    return NextResponse.json({
      ...existing,
      promptHash,
      provider: providerLabel(sceneKey, promptHash, existing.imageUrl ?? null),
    });
  }
  if (existing && existing.status === SceneArtStatus.queued) {
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
  const nextIsGenerated = isGeneratedImage(sceneKey, promptHash, generated.imageUrl);
  const nextIsFallback = isFallbackImage(generated.imageUrl);
  const existingIsGenerated = existing?.imageUrl
    ? isGeneratedImage(sceneKey, promptHash, existing.imageUrl)
    : false;

  if (existingIsGenerated && nextIsFallback) {
    return NextResponse.json({
      ...existing,
      promptHash,
      provider: "remote",
    });
  }

  const shouldPersist = !existing || nextIsGenerated;
  if (!shouldPersist && existing) {
    return NextResponse.json({
      ...existing,
      promptHash,
      provider: providerLabel(sceneKey, promptHash, existing.imageUrl ?? null),
    });
  }

  const updated = await prisma.sceneArt.update({
    where: uniqueWhere,
    data: {
      imageUrl: generated.imageUrl,
      status: SceneArtStatus.ready,
      basePrompt: prompt.basePrompt,
      renderPrompt: prompt.renderPrompt,
      tagsJson: JSON.stringify({ provider: providerLabel(sceneKey, promptHash, generated.imageUrl) }),
    },
  });

  return NextResponse.json({
    ...updated,
    promptHash,
    provider: providerLabel(sceneKey, promptHash, updated.imageUrl),
  });
}
