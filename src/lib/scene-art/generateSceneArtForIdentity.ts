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
  const workerId = getSceneArtWorkerId();

  const attemptCost = resolveSceneArtAttemptCost();
  const providerTimeoutMs = Number(process.env.SCENE_ART_PROVIDER_TIMEOUT_MS ?? 40000);
  const attemptCount = current.attemptCount ?? 0;
  console.log("scene.art.provider.start", {
    sceneKey: context.sceneKey,
    promptHash: context.promptHash,
    attemptCount,
  });
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
    const durationMs = current.generationStartedAt
      ? Date.now() - current.generationStartedAt.getTime()
      : 0;
    const finalizedImageUrl = normalizedImageUrl;
    const claimResult = await prisma.sceneArt.updateMany({
      where: {
        sceneKey: context.sceneKey,
        promptHash: context.promptHash,
        status: SceneArtStatus.generating,
        leaseOwnerId: workerId,
      },
      data: {
        basePrompt: context.basePrompt,
        renderPrompt: context.renderPrompt,
        imageUrl: finalizedImageUrl,
        status: SceneArtStatus.ready,
        tagsJson: JSON.stringify({ ...(generated.provider ? { provider: generated.provider } : DEFAULT_PROVIDER_SOURCE) }),
        generationStartedAt: null,
        generationLeaseUntil: null,
        leaseOwnerId: null,
        leaseAcquiredAt: null,
        lastProviderFailureClass: null,
        lastProviderFailureReason: null,
        lastProviderRetryable: null,
        lastProviderRetryDelayMs: null,
        lastProviderDurationMs: durationMs,
        lastProviderAttemptAt: new Date(),
        lastAttemptCostUsd: attemptCost.attemptCostUsd,
        totalCostUsd: { increment: attemptCost.attemptCostUsd },
        billableAttemptCount: { increment: 1 },
        providerModel: attemptCost.providerModel,
      },
    });

    if (claimResult.count !== 1) {
      throw new Error("SCENE_ART_OWNERSHIP_VIOLATION");
    }

    const updated = await prisma.sceneArt.findUniqueOrThrow({ where: uniqueWhere });
    console.log("scene.art.provider.finalize", {
      sceneKey: context.sceneKey,
      promptHash: context.promptHash,
      nextStatus: SceneArtStatus.ready,
    });
    console.log("scene.art.provider.finish", {
      sceneKey: context.sceneKey,
      promptHash: context.promptHash,
      outcome: "ready",
    });
    logSceneArtEvent("scene.art.completed", {
      sceneKey: context.sceneKey,
      promptHash: context.promptHash,
      status: SceneArtStatus.ready,
      attemptCount: current.attemptCount ?? 0,
      generationStartedAt: current.generationStartedAt ?? null,
      generationLeaseUntil: current.generationLeaseUntil ?? null,
      leaseOwnerId: workerId,
      leaseAcquiredAt: current.leaseAcquiredAt ?? null,
      durationMs,
    });
    return updated;
  } catch (error) {
    console.log("scene.art.provider.catch", {
      sceneKey: context.sceneKey,
      promptHash: context.promptHash,
      error: error instanceof Error ? error.message : String(error),
    });
    const durationMs = current.generationStartedAt
      ? Date.now() - current.generationStartedAt.getTime()
      : 0;
    const classification = classifySceneArtProviderError(error);
    const decision = decideSceneArtRetry(
      classification.failureClass,
      attemptCount,
    );
    const shouldRetry = classification.retryable && decision.retryable && !decision.maxAttemptsReached;
    const result = await prisma.sceneArt.updateMany({
      where: {
        sceneKey: context.sceneKey,
        promptHash: context.promptHash,
        status: SceneArtStatus.generating,
        leaseOwnerId: workerId,
      },
      data: {
        status: shouldRetry ? SceneArtStatus.queued : SceneArtStatus.failed,
        tagsJson: null,
        generationStartedAt: null,
        generationLeaseUntil: null,
        leaseOwnerId: null,
        leaseAcquiredAt: null,
        lastProviderFailureClass: classification.failureClass,
        lastProviderFailureReason: classification.reason,
        lastProviderRetryable: classification.retryable,
        lastProviderRetryDelayMs: decision.retryDelayMs,
        lastProviderDurationMs: durationMs,
        lastProviderAttemptAt: new Date(),
        lastAttemptCostUsd: attemptCost.attemptCostUsd,
        totalCostUsd: { increment: attemptCost.attemptCostUsd },
        billableAttemptCount: { increment: 1 },
        providerModel: attemptCost.providerModel,
        lastRecoveredAt: shouldRetry ? new Date() : current.lastRecoveredAt ?? null,
      },
    });
    if (result.count !== 1) {
      throw new Error("SCENE_ART_OWNERSHIP_VIOLATION");
    }
    const logStatus = shouldRetry ? SceneArtStatus.queued : SceneArtStatus.failed;
    console.log("scene.art.provider.finish", {
      sceneKey: context.sceneKey,
      promptHash: context.promptHash,
      outcome: shouldRetry ? "retryable" : "failed",
    });
    logSceneArtEvent("scene.art.failed", {
      sceneKey: context.sceneKey,
      promptHash: context.promptHash,
      status: logStatus,
      attemptCount,
      generationStartedAt: current.generationStartedAt ?? null,
      generationLeaseUntil: current.generationLeaseUntil ?? null,
      leaseOwnerId: workerId,
      leaseAcquiredAt: current.leaseAcquiredAt ?? null,
      durationMs,
      errorCode: "provider_error",
      errorMessage: error instanceof Error ? error.message : String(error),
      failureClass: classification.failureClass,
      failureRetryable: classification.retryable,
      failureReason: classification.reason,
      failureRetryDelayMs: decision.retryDelayMs,
      failureMaxAttemptsReached: decision.maxAttemptsReached,
      failureDecisionReason: decision.reason,
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

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("scene-art: provider timeout")), ms),
    ),
  ]);
}
