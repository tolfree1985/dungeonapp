import { prisma } from "@/lib/prisma";
import { resolveDisplayedSceneImage } from "@/lib/sceneArt";
import type { ResolvedSceneImage } from "@/lib/sceneArt";
import type { SceneArtStatus } from "@/lib/sceneArtStatus";
import { getSceneArtIdentity } from "@/lib/sceneArtIdentity";
import type { SceneArt } from "@prisma/client";

export type ResolvedSceneImageResult = {
  image: ResolvedSceneImage;
  currentScene: SceneArt | null;
  previousScene: SceneArt | null;
};

export async function loadResolvedSceneImage({
  sceneKey,
  previousSceneKey,
  locationBackdropUrl,
  defaultImageUrl,
  currentSceneState,
}: {
  sceneKey: string | null;
  previousSceneKey: string | null;
  locationBackdropUrl: string | null;
  defaultImageUrl: string;
  currentSceneState: Record<string, unknown> | null;
}): Promise<ResolvedSceneImageResult> {
  const sceneRecord = (currentSceneState ?? null) as Record<string, unknown> | null;
  const currentState = {
    text: typeof sceneRecord?.text === "string" ? sceneRecord.text : null,
    locationKey: typeof sceneRecord?.locationKey === "string" ? sceneRecord.locationKey : null,
    timeKey: typeof sceneRecord?.timeKey === "string" ? sceneRecord.timeKey : null,
  };
  const stylePreset = "victorian-gothic-cinematic";
  const identity = sceneKey
    ? getSceneArtIdentity({
        sceneKey,
        sceneText: currentState.text ?? null,
        locationKey: currentState.locationKey ?? null,
        timeKey: currentState.timeKey ?? null,
        stylePreset: "victorian-gothic-cinematic",
        engineVersion: null,
      })
    : null;
  const promptHash = identity?.promptHash ?? null;
  const promptHash = identity?.promptHash ?? null;
  const uniqueWhere = identity
    ? {
        sceneKey_promptHash: {
          sceneKey,
          promptHash: identity.promptHash,
        },
      }
    : null;

  const [currentScene, previousScene] = await Promise.all([
    uniqueWhere
      ? prisma.sceneArt.findUnique({ where: uniqueWhere })
      : Promise.resolve(null),
    previousSceneKey
      ? prisma.sceneArt.findUnique({ where: { sceneKey: previousSceneKey } })
      : Promise.resolve(null),
  ]);

  const fallbackSceneStatus = (currentScene?.status ?? previousScene?.status) as SceneArtStatus | undefined;
  const fallbackImage = resolveDisplayedSceneImage({
    sceneKey,
    currentSceneImageUrl: null,
    currentScenePending: currentScene?.status === "queued",
    previousSceneImageUrl: previousScene?.imageUrl ?? null,
    locationBackdropUrl,
    defaultImageUrl,
    sceneStatus: fallbackSceneStatus ?? "missing",
  });

  if (currentScene?.status === "ready" && currentScene.imageUrl) {
    return {
      image: {
        imageUrl: currentScene.imageUrl,
        source: "scene",
        pending: false,
        sceneKey,
        status: "ready",
        sceneArtStatus: "ready",
        provider: extractProvider(currentScene),
        promptHash,
      },
      currentScene,
      previousScene,
    };
  }

  const shouldTriggerGeneration = !!sceneKey && !!identity && !currentScene;
  if (shouldTriggerGeneration) {
    triggerSceneArtGeneration({
      sceneKey,
      promptHash: identity?.promptHash ?? null,
      sceneText: currentState.text,
      locationKey: currentState.locationKey,
      timeKey: currentState.timeKey,
      stylePreset,
    });
  }

  const lifecycleStatus = currentScene
    ? currentScene.status === "failed"
      ? "failed"
      : "generating"
    : "generating";
  const provider = currentScene ? extractProvider(currentScene) : "fallback";

  return {
    image: {
      ...fallbackImage,
      pending: lifecycleStatus === "generating",
      sceneArtStatus: lifecycleStatus,
      provider,
      promptHash,
    },
    currentScene,
    previousScene,
  };
}

type SceneArtLifecycleQueryParams = {
  sceneKey: string;
  promptHash: string | null;
  sceneText?: string | null;
  locationKey?: string | null;
  timeKey?: string | null;
  stylePreset?: string | null;
  engineVersion?: string | null;
};

function triggerSceneArtGeneration(params: SceneArtLifecycleQueryParams) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3001";
  const url = new URL(`/api/scene-art/generate/${params.sceneKey}`, baseUrl);
  if (params.sceneText) url.searchParams.set("sceneText", params.sceneText);
  if (params.locationKey) url.searchParams.set("locationKey", params.locationKey);
  if (params.timeKey) url.searchParams.set("timeKey", params.timeKey);
  if (params.stylePreset) url.searchParams.set("stylePreset", params.stylePreset);
  if (params.engineVersion) url.searchParams.set("engineVersion", params.engineVersion);
  if (params.promptHash) url.searchParams.set("promptHash", params.promptHash);
  void fetch(url, { method: "GET", cache: "no-store" }).catch(() => {
    console.warn("Scene art generation trigger failed", { sceneKey: params.sceneKey });
  });
}

function extractProvider(row: SceneArt): "remote" | "fallback" | "none" {
  if (!row) return "none";
  if (row.tagsJson) {
    try {
      const parsed = JSON.parse(row.tagsJson);
      if (parsed?.provider === "fallback") return "fallback";
      if (parsed?.provider === "remote") return "remote";
    } catch {
      // ignore
    }
  }
  return row.status === "ready" ? "remote" : "fallback";
}
