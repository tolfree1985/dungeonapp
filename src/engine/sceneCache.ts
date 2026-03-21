import { prisma } from "@/lib/prisma";
import type { SceneArtRow } from "@/lib/resolveTurnSceneArtPresentation";

export async function getCachedSceneArt(sceneKey: string, shotKey: string): Promise<SceneArtRow | null> {
  if (!shotKey) return null;
  const cache = await prisma.sceneArtShotCache.findUnique({
    where: { sceneKey_shotKey: { sceneKey, shotKey } },
    include: { sceneArt: true },
  });
  if (!cache?.sceneArt) return null;
  return {
    id: cache.sceneArt.id,
    sceneKey: cache.sceneArt.sceneKey,
    status: cache.sceneArt.status,
    imageUrl: cache.sceneArt.imageUrl,
  };
}

export async function writeCachedSceneArt(sceneKey: string, shotKey: string, sceneArtId: string): Promise<void> {
  if (!shotKey || !sceneArtId) return;
  await prisma.sceneArtShotCache.upsert({
    where: { sceneKey_shotKey: { sceneKey, shotKey } },
    update: { sceneArtId },
    create: {
      sceneKey,
      shotKey,
      sceneArtId,
    },
  });
}
