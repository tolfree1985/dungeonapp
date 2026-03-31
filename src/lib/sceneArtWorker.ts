import { prisma } from "@/lib/prisma";
import {
  generateSceneArtForExecutionContext,
  type SceneArtExecutionContext,
  type SceneArtGeneratorOverride,
} from "@/lib/scene-art/generateSceneArtForIdentity";
import type { RenderMode } from "@/lib/sceneArtRepo";

const logger = console;
const TIMEOUT_MS = 120_000;

export async function processQueuedSceneArt(args?: {
  limit?: number;
  generator?: SceneArtGeneratorOverride;
}) {
  const limit = args?.limit ?? 5;
  const generator = args?.generator;

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
      promptHash: true,
      basePrompt: true,
      renderPrompt: true,
      stylePreset: true,
      renderMode: true,
      engineVersion: true,
      createdAt: true,
      updatedAt: true,
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

    if (!row.promptHash) {
      logger.error("sceneArt.render.invalid_row", { sceneKey: row.sceneKey, reason: "missing_prompt_hash" });
      failed += 1;
      continue;
    }

    const context: SceneArtExecutionContext = {
      sceneKey: row.sceneKey,
      promptHash: row.promptHash,
      basePrompt: row.basePrompt,
      renderPrompt: row.renderPrompt,
      stylePreset: row.stylePreset,
      renderMode: row.renderMode,
      engineVersion: row.engineVersion,
    };

    try {
      await generateSceneArtForExecutionContext(context, {
        force: true,
        generator,
      });

      ready += 1;
      logger.info("sceneArt.render.success", {
        sceneKey: row.sceneKey,
        durationMs: Date.now() - start,
        model: row.engineVersion ?? "unknown",
        renderMode: row.renderMode,
      });
    } catch (error) {
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
