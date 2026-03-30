import { prisma } from "@/lib/prisma";
import { SceneArtStatus } from "@/generated/prisma";
import type { SceneArt } from "@prisma/client";
import { generateImage } from "@/lib/sceneArtGenerator";
import type { SceneArtIdentity } from "@/lib/sceneArtIdentity";
import { logSceneArtEvent } from "@/lib/scene-art/logging";
import type { RenderMode } from "@/generated/prisma";
import { getSceneArtWorkerId } from "@/lib/scene-art/workerIdentity";
import { classifySceneArtProviderError } from "@/lib/scene-art/classifyProviderError";
import { decideSceneArtRetry } from "@/lib/scene-art/decideProviderRetry";
import { resolveSceneArtAttemptCost } from "@/lib/scene-art/providerCostConfig";

const DEFAULT_PROVIDER_SOURCE = { provider: "remote" };

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
  const providerTimeoutMs = Number(process.env.SCENE_ART_PROVIDER_TIMEOUT_MS ?? 40000);
  const attemptCount = current.attemptCount ?? 0;
  console.log("scene.art.provider.start", {
    sceneKey: context.sceneKey,
    promptHash: context.promptHash,
    attemptCount,
  });
  let providerResult: SceneArtExecutionResult | null = null;
  let durationMs = 0;
  try {
    const generated = await withTimeout(
      generateImage(context.renderPrompt, context.sceneKey, context.promptHash),
      providerTimeoutMs,
    );
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
  const updateData: Parameters<typeof prisma.sceneArt.update>[0]['data'] = {
    basePrompt: context.basePrompt,
    renderPrompt: context.renderPrompt,
    status: decision.nextStatus,
    tagsJson: JSON.stringify({ ...(providerResult.providerMeta ?? { provider: DEFAULT_PROVIDER_SOURCE.provider }) }),
    imageUrl: providerResult.kind === 'success' ? providerResult.imagePath : null,
    generationStartedAt: null,
    generationLeaseUntil: decision.nextRetryAt,
    leaseOwnerId: decision.clearLease ? null : current.leaseOwnerId,
    leaseAcquiredAt: decision.clearLease ? null : current.leaseAcquiredAt,
    generationCompletedAt: decision.generationCompletedAt,
    lastProviderFailureClass:
      providerResult.kind === 'failure' ? providerResult.failureClass ?? null : null,
    lastProviderFailureReason:
      providerResult.kind === 'failure' ? providerResult.errorMessage ?? null : null,
    lastProviderRetryable:
      providerResult.kind === 'failure' ? providerResult.retryable : null,
    lastProviderRetryDelayMs:
      providerResult.kind === 'failure' ? providerResult.retryDelayMs ?? null : null,
    lastProviderDurationMs: durationMs,
    lastProviderAttemptAt: now,
    lastAttemptCostUsd: attemptCost.attemptCostUsd,
    totalCostUsd: { increment: attemptCost.attemptCostUsd },
    billableAttemptCount: { increment: 1 },
    providerModel: attemptCost.providerModel,
  };
  const updateResult = await prisma.sceneArt.updateMany({
    where: {
      id: current.id,
      leaseOwnerId: workerId,
    },
    data: updateData,
  });

  if (updateResult.count !== 1) {
    throw new Error("scene-art: lease ownership lost before finalize");
  }
  const updated = await prisma.sceneArt.findUniqueOrThrow({ where: uniqueWhere });
  console.log("scene.art.provider.finalize", {
    sceneKey: context.sceneKey,
    promptHash: context.promptHash,
    nextStatus: decision.nextStatus,
  });
  const outcome = providerResult.kind === 'success' ? 'ready' : decision.nextStatus === SceneArtStatus.failed ? 'failed' : 'retryable';
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
