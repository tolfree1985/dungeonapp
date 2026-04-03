import { prisma } from "@/lib/prisma";
import type { SceneArt } from "@prisma/client";
import { generateImage } from "@/lib/sceneArtGenerator";
import type { SceneArtIdentity } from "@/lib/sceneArtIdentity";
import { logSceneArtEvent } from "@/lib/scene-art/logging";
import type { RenderMode } from "@/generated/prisma";
import { getSceneArtWorkerId } from "@/lib/scene-art/workerIdentity";
import { classifySceneArtProviderError } from "@/lib/scene-art/classifyProviderError";
import { decideSceneArtRetry } from "@/lib/scene-art/decideProviderRetry";
import { resolveSceneArtAttemptCost } from "@/lib/scene-art/providerCostConfig";
import { finalizeSceneArtExecution } from "@/lib/scene-art/sceneArtFinalize";
import { persistSceneArtResult } from "@/lib/scene-art/persistSceneArtResult";

const DEFAULT_PROVIDER_SOURCE = { provider: "remote" };
const PROVIDER_TIMEOUT_MS = 90_000;

export type SceneArtExecutionContext = {
  sceneKey: string;
  promptHash: string;
  basePrompt: string;
  renderPrompt: string;
  stylePreset: string | null;
  renderMode: RenderMode;
  engineVersion: string | null;
  workerId?: string;
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
  const workerId = context.workerId ?? getSceneArtWorkerId();

  const attemptCost = resolveSceneArtAttemptCost();
  const providerTimeoutMs = Number(process.env.SCENE_ART_PROVIDER_TIMEOUT_MS ?? PROVIDER_TIMEOUT_MS);
  const attemptCount = current.attemptCount ?? 0;
  console.log("scene.art.provider.start", {
    sceneKey: context.sceneKey,
    promptHash: context.promptHash,
    attemptCount,
  });
  const providerName =
    process.env.IMAGE_PROVIDER_URL
      ? "remote"
      : process.env.EXTERNAL_IMAGE_PROVIDER_URL
      ? "remote"
      : process.env.OPENAI_API_KEY
      ? "openai"
      : null;
  console.log("scene.art.provider.selected", {
    provider: providerName,
  });
  if (!providerName) {
    console.error("scene.art.provider.missing", {
      sceneKey: context.sceneKey,
      promptHash: context.promptHash,
    });
    await persistSceneArtResult({
      sceneKey: context.sceneKey,
      promptHash: context.promptHash,
      status: "failed",
      lastError: "missing_provider",
    });
    return current;
  }
  let providerResult: SceneArtExecutionResult | null = null;
  let durationMs = 0;
  try {
    const generated = await generateImage({
      provider: providerName,
      prompt: context.renderPrompt,
      sceneKey: context.sceneKey,
      promptHash: context.promptHash,
    });
    const normalizedImageUrl =
      (generated as any)?.imageUrl ??
      (generated as any)?.url ??
      (generated as any)?.data?.[0]?.url ??
      null;
    if (!normalizedImageUrl || normalizedImageUrl.includes("generated-placeholder")) {
      throw new Error("scene-art: provider returned placeholder or missing imageUrl");
    }
    console.log("scene.art.provider.returned", {
      sceneKey: context.sceneKey,
      promptHash: context.promptHash,
    });
    durationMs = current.generationStartedAt
      ? Date.now() - current.generationStartedAt.getTime()
      : 0;
    const finalizedImageUrl = normalizedImageUrl;
    const providerMeta = { provider: (generated as any).provider ?? DEFAULT_PROVIDER_SOURCE.provider };
    providerResult = {
      kind: 'success',
      imagePath: finalizedImageUrl,
      providerAssetUrl: finalizedImageUrl,
      providerMeta,
    };
  } catch (error) {
    console.log("scene.art.provider.catch", {
      sceneKey: context.sceneKey,
      promptHash: context.promptHash,
      error: error instanceof Error ? error.message : String(error),
    });
    durationMs = current.generationStartedAt
      ? Date.now() - current.generationStartedAt.getTime()
      : 0;
    const classification = classifySceneArtProviderError(error);
    const decision = decideSceneArtRetry(classification.failureClass, attemptCount);
    providerResult = {
      kind: 'failure',
      retryable: classification.retryable && decision.retryable && !decision.maxAttemptsReached,
      retryDelayMs: decision.retryDelayMs,
      errorCode: classification.failureClass,
      errorMessage: classification.reason,
      failureClass: classification.failureClass,
      providerMeta: { failureClass: classification.failureClass },
    };
  }

  if (!providerResult) {
    throw new Error('scene-art: provider result missing');
  }
  const now = new Date();
  const decision = finalizeSceneArtExecution({
    row: {
      status: current.status,
      attemptCount: current.attemptCount ?? 0,
      lastProviderRetryable: current.lastProviderRetryable ?? null,
    },
    result: providerResult,
    now,
  });
  const nextStatusLiteral =
    providerResult.kind === 'success'
      ? 'ready'
      : decision.nextStatus === 'failed'
      ? 'failed'
      : 'retryable';
  const imageUrl = providerResult.kind === 'success' ? providerResult.imagePath : null;
  let updated;
  try {
    updated = await persistSceneArtResult({
      sceneKey: context.sceneKey,
      promptHash: context.promptHash,
      status: nextStatusLiteral,
      imageUrl,
      lastError: providerResult.kind === 'failure' ? providerResult.errorMessage ?? null : null,
    });
  } catch (error) {
    console.error("scene.art.worker.persist.crash", {
      sceneKey: context.sceneKey,
      promptHash: context.promptHash,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : null,
    });
    throw error;
  }
  console.log("scene.art.provider.finalize", {
    sceneKey: context.sceneKey,
    promptHash: context.promptHash,
    nextStatus: nextStatusLiteral,
  });
  const outcome = providerResult.kind === 'success' ? 'ready' : nextStatusLiteral;
  console.log("scene.art.provider.finish", {
    sceneKey: context.sceneKey,
    promptHash: context.promptHash,
    outcome,
  });
  const eventName = providerResult.kind === 'success' ? 'scene.art.completed' : 'scene.art.failed';
  logSceneArtEvent(eventName, {
    sceneKey: context.sceneKey,
    promptHash: context.promptHash,
    status: decision.nextStatus,
    attemptCount: current.attemptCount ?? 0,
    generationStartedAt: current.generationStartedAt ?? null,
    generationLeaseUntil: current.generationLeaseUntil ?? null,
    leaseOwnerId: workerId,
    leaseAcquiredAt: current.leaseAcquiredAt ?? null,
    durationMs,
    errorCode: providerResult.kind === 'failure' ? providerResult.errorCode ?? null : null,
    errorMessage: providerResult.kind === 'failure' ? providerResult.errorMessage ?? null : null,
    failureClass: providerResult.kind === 'failure' ? providerResult.failureClass ?? null : null,
    failureRetryable: providerResult.kind === 'failure' ? providerResult.retryable : null,
    failureRetryDelayMs: providerResult.kind === 'failure' ? providerResult.retryDelayMs : null,
  });
  if (providerResult.kind === 'success') {
    if (!imageUrl) {
      console.warn("scene.art.worker.no_image_url", {
        sceneKey: context.sceneKey,
        promptHash: context.promptHash,
      });
      return updated;
    }

    console.log("scene.art.worker.persist.attempt", {
      sceneKey: context.sceneKey,
      promptHash: context.promptHash,
      imageUrl,
    });
    await prisma.sceneArt.update({
      where: {
        sceneKey_promptHash: {
          sceneKey: context.sceneKey,
          promptHash: context.promptHash,
        },
      },
      data: {
        status: "ready",
        imageUrl,
      },
    });
    console.log("scene.art.worker.persist.ready", {
      sceneKey: context.sceneKey,
      promptHash: context.promptHash,
      imageUrl,
    });
    const persisted = await prisma.sceneArt.findUniqueOrThrow({ where: uniqueWhere });
    return persisted;
  }

  return updated;
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

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("scene-art: provider timeout")), ms),
    ),
  ]);
}
