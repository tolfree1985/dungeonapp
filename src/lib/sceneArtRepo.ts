import { prisma } from "@/lib/prisma";
import type { SceneArtPayload } from "@/lib/sceneArt";
import type { SceneArtPriority } from "@/generated/prisma";

export type RenderMode = "full" | "partial";

export async function findSceneArt(sceneKey: string) {
  return prisma.sceneArt.findUnique({
    where: { sceneKey },
  });
}

export async function queueSceneArt(
  payload: SceneArtPayload,
  engineVersion?: string | null,
  renderPriority: SceneArtPriority = "normal",
  renderMode: RenderMode = "full",
) {
  console.info("scene.render.queue_request", {
    sceneKey: payload.sceneKey,
    renderMode,
  });
  return prisma.sceneArt.upsert({
    where: { sceneKey: payload.sceneKey },
    update: { renderMode },
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
      renderPriority,
      renderMode,
    },
  });
}
