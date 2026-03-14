import { prisma } from "@/lib/prisma";
import type { SceneArtPayload } from "@/lib/sceneArt";

export async function findSceneArt(sceneKey: string) {
  return prisma.sceneArt.findUnique({
    where: { sceneKey },
  });
}

export async function queueSceneArt(payload: SceneArtPayload, engineVersion?: string | null) {
  console.log("sceneArt repo write", {
    sceneKey: payload.sceneKey,
    title: payload.title,
  });
  return prisma.sceneArt.upsert({
    where: { sceneKey: payload.sceneKey },
    update: {},
    create: {
      sceneKey: payload.sceneKey,
      title: payload.title ?? null,
      basePrompt: payload.basePrompt,
      renderPrompt: payload.renderPrompt,
      stylePreset: payload.stylePreset,
      tagsJson: JSON.stringify(payload.tags ?? []),
      status: "queued",
      imageUrl: null,
      engineVersion: engineVersion ?? null,
    },
  });
}
