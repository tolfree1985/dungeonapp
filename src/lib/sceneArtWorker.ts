import { prisma } from "@/lib/prisma";
import type { RenderMode } from "@/lib/sceneArtRepo";

type RenderSceneArtResult = {
  imageUrl: string;
};

export type SceneArtRenderer = (input: {
  sceneArtId: string;
  sceneKey: string;
  renderMode: RenderMode;
  renderPrompt: string;
}) => Promise<RenderSceneArtResult>;

async function defaultRenderer({
  sceneArtId,
  sceneKey,
  renderPrompt,
  renderMode,
}: {
  sceneArtId: string;
  sceneKey: string;
  renderPrompt: string;
  renderMode: RenderMode;
}): Promise<RenderSceneArtResult> {
  const renderRequest =
    renderMode === "partial"
      ? {
          sceneArtId,
          sceneKey,
          renderPrompt,
          renderMode,
          continuityHint: "preserve-framing-subject-shot",
          promptStrategy: "delta-minimal",
          shotBias: "locked",
        }
      : {
          sceneArtId,
          sceneKey,
          renderPrompt,
          renderMode,
          continuityHint: "fresh render",
          promptStrategy: "full",
          shotBias: "dynamic",
        };

  logger.info("sceneArt.render.mode", renderRequest);
  // In production this branch would call the actual renderer with `renderRequest`.
  return {
    imageUrl: `/scene-ready-${renderMode}.svg`,
  };
}

const logger = console;
const TIMEOUT_MS = 120_000;

export async function processQueuedSceneArt(args?: {
  limit?: number;
  renderer?: SceneArtRenderer;
}) {
  const limit = args?.limit ?? 5;
  const renderer = args?.renderer ?? defaultRenderer;

  const queuedRows = await prisma.sceneArt.findMany({
    where: { status: "queued" },
    orderBy: [
      { renderPriority: "desc" },
      { updatedAt: "asc" },
    ],
    take: limit,
    select: {
      id: true,
      sceneKey: true,
      renderPrompt: true,
      createdAt: true,
      updatedAt: true,
      engineVersion: true,
      renderMode: true,
    },
  });

  let processed = 0;
  let ready = 0;
  let failed = 0;

  for (const row of queuedRows) {
    processed += 1;
    const ageMs = Date.now() - row.updatedAt.getTime();
    if (ageMs > TIMEOUT_MS) {
      await prisma.sceneArt.update({
        where: { id: row.id },
        data: { status: "failed" },
      });
      failed += 1;
      logger.error("sceneArt.render.failure", {
        sceneKey: row.sceneKey,
        reason: "timeout",
        ageMs,
      });
      continue;
    }

    const start = Date.now();
    logger.info("sceneArt.render.start", { sceneKey: row.sceneKey, renderMode: row.renderMode });

    try {
      const result = await renderer({
        sceneArtId: row.id,
        sceneKey: row.sceneKey,
        renderMode: row.renderMode,
        renderPrompt: row.renderPrompt,
      });

      await prisma.sceneArt.update({
        where: { id: row.id },
        data: {
          status: "ready",
          imageUrl: result.imageUrl,
        },
      });

      ready += 1;
      logger.info("sceneArt.render.success", {
        sceneKey: row.sceneKey,
        durationMs: Date.now() - start,
        model: row.engineVersion ?? "unknown",
        renderMode: row.renderMode,
      });
    } catch (error) {
      await prisma.sceneArt.update({
        where: { id: row.id },
        data: {
          status: "failed",
        },
      });

      failed += 1;
      logger.error("sceneArt.render.failure", {
        sceneKey: row.sceneKey,
        model: row.engineVersion ?? "unknown",
        error,
        renderMode: row.renderMode,
      });
    }
  }

  return {
    processed,
    ready,
    failed,
  };
}
