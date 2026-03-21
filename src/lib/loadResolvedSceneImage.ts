import { prisma } from "@/lib/prisma";
import { resolveDisplayedSceneImage } from "@/lib/sceneArt";
import type { SceneArtStatus } from "@/lib/sceneArtStatus";
import { buildScenePrompt, buildSceneArtPromptInput } from "@/lib/sceneArtGenerator";
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
  const promptInput = sceneKey
    ? buildSceneArtPromptInput({
        sceneKey,
        currentSceneState: currentState,
        stylePreset,
        engineVersion: null,
      })
    : null;
  const promptResult = promptInput ? buildScenePrompt(promptInput) : null;
  const promptHash = promptResult?.promptHash ?? null;
  if (promptInput && promptResult) {
    console.log("SCENE ART PROMPT HASH", promptResult.promptHash);
  }
  const uniqueWhere = sceneKey && promptHash
    ? {
        sceneKey_promptHash: {
          sceneKey,
          promptHash,
        },
      }
    : null;
  const [currentScene, previousScene] = await Promise.all([
    uniqueWhere
      ? prisma.sceneArt.findUnique({ where: uniqueWhere })
      : Promise.resolve(null),
    previousSceneKey ? prisma.sceneArt.findUnique({ where: { sceneKey: previousSceneKey } }) : Promise.resolve(null),
  ]);

  if (currentScene || previousScene) {
    const reportedStatus = (currentScene?.status ?? previousScene?.status) as SceneArtStatus | undefined;
    console.log("sceneArt loader row", {
      sceneKey,
      status: reportedStatus ?? "missing",
      imageUrl: currentScene?.imageUrl ?? previousScene?.imageUrl ?? null,
    });
  }


  console.log("loadResolvedSceneImage", {
    sceneKey,
    previousSceneKey,
    currentScene,
    currentSceneState,
  });

  const currentReady = currentScene?.status === "ready" && currentScene.imageUrl;
  const previousReady = previousScene?.status === "ready" && previousScene.imageUrl;
  if (currentReady) {
    return {
      image: {
        imageUrl: currentScene.imageUrl,
        source: "scene",
        pending: false,
        sceneKey,
        status: "ready",
      },
      currentScene,
      previousScene,
    };
  }

  if (previousReady) {
    return {
      image: {
        imageUrl: previousScene.imageUrl,
        source: "scene",
        pending: currentScene?.status === "queued",
        sceneKey,
        status: "ready",
      },
      currentScene,
      previousScene,
    };
  }

  const generatorParams = {
    sceneKey,
    sceneText,
    locationKey,
    timeKey,
    stylePreset,
  };

  if (!currentReady && !previousReady && sceneKey) {
    triggerSceneArtGeneration(generatorParams);
    return {
      image: {
        imageUrl: `/api/scene-art/fallback/${sceneKey}`,
        source: "deterministic-fallback",
        pending: true,
        sceneKey,
        status: "pending",
      },
      currentScene,
      previousScene,
    };
  }

    const image = resolveDisplayedSceneImage({
      sceneStatus: (currentScene?.status as SceneArtStatus) ?? "missing",
      sceneKey,
      currentSceneImageUrl: null,
      currentScenePending: !!currentScene && currentScene.status === "queued",
      previousSceneImageUrl: null,
      locationBackdropUrl,
      defaultImageUrl,
    });
    return {
      image,
      currentScene,
      previousScene,
    };
  }

function triggerSceneArtGeneration(params: {
  sceneKey: string;
  sceneText?: string | null;
  locationKey?: string | null;
  timeKey?: string | null;
  stylePreset?: string | null;
  engineVersion?: string | null;
}) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3001";
  const url = new URL(`/api/scene-art/generate/${params.sceneKey}`, baseUrl);
  if (params.sceneText) url.searchParams.set("sceneText", params.sceneText);
  if (params.locationKey) url.searchParams.set("locationKey", params.locationKey);
  if (params.timeKey) url.searchParams.set("timeKey", params.timeKey);
  if (params.stylePreset) url.searchParams.set("stylePreset", params.stylePreset);
  if (params.engineVersion) url.searchParams.set("engineVersion", params.engineVersion);
  void fetch(url).catch((error) => {
    console.warn("Scene art generation trigger failed", { sceneKey: params.sceneKey, error });
  });
}
