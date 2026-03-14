import { prisma } from "@/lib/prisma";
import { resolveDisplayedSceneImage } from "@/lib/sceneArt";

export async function loadResolvedSceneImage({
  sceneKey,
  previousSceneKey,
  locationBackdropUrl,
  defaultImageUrl,
}: {
  sceneKey: string | null;
  previousSceneKey: string | null;
  locationBackdropUrl: string | null;
  defaultImageUrl: string;
}) {
  const [currentScene, previousScene] = await Promise.all([
    sceneKey ? prisma.sceneArt.findUnique({ where: { sceneKey } }) : Promise.resolve(null),
    previousSceneKey ? prisma.sceneArt.findUnique({ where: { sceneKey: previousSceneKey } }) : Promise.resolve(null),
  ]);

  if (currentScene || previousScene) {
    console.log("sceneArt loader row", {
      sceneKey,
      status: currentScene?.status ?? previousScene?.status ?? null,
      imageUrl: currentScene?.imageUrl ?? previousScene?.imageUrl ?? null,
    });
  }

  console.log("loadResolvedSceneImage", {
    sceneKey,
    previousSceneKey,
    currentScene,
  });

  const currentReady = currentScene?.status === "ready" && currentScene.imageUrl;
  const previousReady = previousScene?.status === "ready" && previousScene.imageUrl;
  if (currentReady) {
    return {
      imageUrl: currentScene.imageUrl,
      source: "scene",
      pending: false,
    };
  }

  if (previousReady) {
    return {
      imageUrl: previousScene.imageUrl,
      source: "scene",
      pending: currentScene?.status === "queued",
    };
  }

  return resolveDisplayedSceneImage({
    currentSceneImageUrl: null,
    currentScenePending: !!currentScene && currentScene.status === "queued",
    previousSceneImageUrl: null,
    locationBackdropUrl,
    defaultImageUrl,
  });
}
