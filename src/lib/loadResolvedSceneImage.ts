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

  return resolveDisplayedSceneImage({
    currentSceneImageUrl: currentScene?.status === "ready" ? currentScene.imageUrl : null,
    currentScenePending: currentScene?.status === "queued",
    previousSceneImageUrl: previousScene?.status === "ready" ? previousScene.imageUrl : null,
    locationBackdropUrl,
    defaultImageUrl,
  });
}
