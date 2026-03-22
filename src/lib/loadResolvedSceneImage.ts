import { prisma } from "@/lib/prisma";
import type { SceneArt } from "@prisma/client";
import { getSceneArtIdentity } from "@/lib/sceneArtIdentity";
import { sceneArtFileExists } from "@/lib/scene-art/fileSystem";
import type { ResolvedSceneImage } from "@/lib/scene-art/types";

type SceneArtRow = {
  status: string;
  imageUrl: string | null;
  promptHash: string | null;
  errorMessage?: string | null;
};

function mapSceneArtRowStatus(rawStatus: string): "pending" | "generating" | "ready" | "failed" {
  switch (rawStatus) {
    case "queued":
    case "pending":
      return "pending";
    case "generating":
      return "generating";
    case "ready":
      return "ready";
    case "failed":
      return "failed";
    default:
      throw new Error(`SCENE_ART_UNKNOWN_STATUS:${rawStatus}`);
  }
}

function toMissing(promptHash: string | null): ResolvedSceneImage {
  return {
    status: "missing",
    imageUrl: null,
    promptHash,
    errorCode: "SCENE_ART_READY_FILE_MISSING",
  };
}

async function mapPresentation(row: SceneArtRow | null): Promise<ResolvedSceneImage> {
  if (!row) {
    return {
      status: "pending",
      imageUrl: null,
      promptHash: null,
    };
  }

  const normalized = mapSceneArtRowStatus(row.status);

  if (normalized === "ready") {
    if (!row.imageUrl) {
      return toMissing(row.promptHash ?? null);
    }

    const exists = await sceneArtFileExists(row.imageUrl);
    if (!exists) {
      return toMissing(row.promptHash ?? null);
    }

    return {
      status: "ready",
      imageUrl: row.imageUrl,
      promptHash: row.promptHash ?? "",
    };
  }

  if (normalized === "generating") {
    return {
      status: "generating",
      imageUrl: null,
      promptHash: row.promptHash ?? null,
    };
  }

  if (normalized === "failed") {
    return {
      status: "failed",
      imageUrl: null,
      promptHash: row.promptHash ?? null,
      errorCode: row.errorMessage ?? "SCENE_ART_FAILED",
    };
  }

  return {
    status: "pending",
    imageUrl: null,
    promptHash: row.promptHash ?? null,
  };
}

export async function loadResolvedSceneImage({
  sceneKey,
  locationBackdropUrl,
  defaultImageUrl,
  currentSceneState,
}: {
  sceneKey: string | null;
  locationBackdropUrl: string | null;
  defaultImageUrl: string;
  currentSceneState: Record<string, unknown> | null;
}): Promise<ResolvedSceneImage> {
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
        stylePreset,
        renderMode: "full",
        engineVersion: null,
      })
    : null;
  const promptHash = identity?.promptHash ?? null;
  const uniqueWhere = identity
    ? {
        sceneKey_promptHash: {
          sceneKey,
          promptHash: identity.promptHash,
        },
      }
    : null;

  const currentScene = uniqueWhere
    ? await prisma.sceneArt.findUnique({ where: uniqueWhere })
    : null;

  const shouldTriggerGeneration = !!sceneKey && !!identity && !currentScene;
  if (shouldTriggerGeneration) {
    triggerSceneArtGeneration({
      sceneKey,
      promptHash: identity?.promptHash ?? null,
      sceneText: currentState.text,
      stylePreset,
    });
  }

  const presentation = await mapPresentation(currentScene);
  if (shouldTriggerGeneration && presentation.status === "pending") {
    return {
      ...presentation,
      status: "generating",
    };
  }
  return presentation;
}

type SceneArtLifecycleQueryParams = {
  sceneKey: string;
  promptHash: string | null;
  sceneText?: string | null;
  stylePreset?: string | null;
  engineVersion?: string | null;
};

function triggerSceneArtGeneration(params: SceneArtLifecycleQueryParams) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3001";
  const url = new URL(`/api/scene-art/generate/${params.sceneKey}`, baseUrl);
  if (params.sceneText) url.searchParams.set("sceneText", params.sceneText);
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
