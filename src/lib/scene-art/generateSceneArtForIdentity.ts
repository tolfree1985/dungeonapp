import { prisma } from "@/lib/prisma";
import { SceneArtStatus } from "@/generated/prisma";
import type { SceneArt } from "@prisma/client";
import { generateImage } from "@/lib/sceneArtGenerator";
import type { SceneArtIdentity } from "@/lib/sceneArtIdentity";
import { logSceneArtEvent } from "@/lib/scene-art/logging";
import type { RenderMode } from "@/generated/prisma";

const DEFAULT_PROVIDER_SOURCE = { provider: "remote" };

export type SceneArtExecutionContext = {
  sceneKey: string;
  promptHash: string;
  basePrompt: string;
  renderPrompt: string;
  stylePreset: string | null;
  renderMode: RenderMode;
  engineVersion: string | null;
};

export async function generateSceneArtForExecutionContext(
  context: SceneArtExecutionContext,
  _options?: { force?: boolean },
): Promise<SceneArt> {
  const uniqueWhere = {
    sceneKey_promptHash: {
      sceneKey: context.sceneKey,
      promptHash: context.promptHash,
    },
  };
  const current = await prisma.sceneArt.findUniqueOrThrow({ where: uniqueWhere });

  try {
    const generated = await generateImage(context.renderPrompt, context.sceneKey, context.promptHash);
    const updated = await prisma.sceneArt.update({
      where: uniqueWhere,
      data: {
        basePrompt: context.basePrompt,
        renderPrompt: context.renderPrompt,
        imageUrl: generated.imageUrl,
        status: SceneArtStatus.ready,
        tagsJson: JSON.stringify({ ...(generated.provider ? { provider: generated.provider } : DEFAULT_PROVIDER_SOURCE) }),
        generationStartedAt: null,
        generationLeaseUntil: null,
      },
    });
    const durationMs = current.generationStartedAt
      ? Date.now() - current.generationStartedAt.getTime()
      : 0;
    logSceneArtEvent("scene.art.completed", {
      sceneKey: context.sceneKey,
      promptHash: context.promptHash,
      status: SceneArtStatus.ready,
      attemptCount: current.attemptCount ?? 0,
      generationStartedAt: current.generationStartedAt ?? null,
      generationLeaseUntil: current.generationLeaseUntil ?? null,
      durationMs,
    });
    return updated;
  } catch (error) {
    await prisma.sceneArt.update({
      where: uniqueWhere,
      data: {
        status: SceneArtStatus.failed,
        tagsJson: null,
        generationStartedAt: null,
        generationLeaseUntil: null,
      },
    });
    const durationMs = current.generationStartedAt
      ? Date.now() - current.generationStartedAt.getTime()
      : 0;
    logSceneArtEvent("scene.art.failed", {
      sceneKey: context.sceneKey,
      promptHash: context.promptHash,
      status: SceneArtStatus.failed,
      attemptCount: current.attemptCount ?? 0,
      generationStartedAt: current.generationStartedAt ?? null,
      generationLeaseUntil: current.generationLeaseUntil ?? null,
      durationMs,
      errorCode: "provider_error",
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function generateSceneArtForIdentity(
  identity: SceneArtIdentity,
  options?: { force?: boolean },
): Promise<SceneArt> {
  const context: SceneArtExecutionContext = {
    sceneKey: identity.sceneKey,
    promptHash: identity.promptHash,
    basePrompt: identity.basePrompt,
    renderPrompt: identity.renderPrompt,
    stylePreset: identity.stylePreset,
    renderMode: identity.renderMode,
    engineVersion: identity.engineVersion,
  };
  return generateSceneArtForExecutionContext(context, options);
}
