import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SceneArtStatus } from "@/generated/prisma";
import { SceneArtExecutionContext, generateSceneArtForExecutionContext } from "@/lib/scene-art/generateSceneArtForIdentity";
import { logSceneArtEvent } from "@/lib/scene-art/logging";
import { getSceneArtWorkerId } from "@/lib/scene-art/workerIdentity";
import { getSceneArtWorkerRuntimeConfig } from "@/lib/scene-art/workerRuntimeConfig";

export type SceneArtIdentityInput = {
  sceneKey: string;
  promptHash: string;
};

type SceneArtRow = Prisma.SceneArtGetPayload<{}>;

function buildExecutionContext(row: Prisma.SceneArtGetPayload<{}>): SceneArtExecutionContext {
  return {
    sceneKey: row.sceneKey,
    promptHash: row.promptHash,
    basePrompt: row.basePrompt,
    renderPrompt: row.renderPrompt,
    stylePreset: row.stylePreset,
    renderMode: row.renderMode,
    engineVersion: row.engineVersion,
  };
}

export type SceneArtAttemptResult = {
  sceneKey: string;
  promptHash: string;
  lastAttemptCostUsd: number;
};

export interface SceneArtAttemptError extends Error {
  attemptResult?: SceneArtAttemptResult;
}

function attemptResultFromRow(row: SceneArtRow): SceneArtAttemptResult {
  return {
    sceneKey: row.sceneKey,
    promptHash: row.promptHash,
    lastAttemptCostUsd: row.lastAttemptCostUsd ?? 0,
  };
}

export async function runQueuedSceneArtGeneration(identity: SceneArtIdentityInput): Promise<SceneArtAttemptResult | null> {
  const { sceneKey, promptHash } = identity;

  if (!sceneKey) {
    throw new Error("SCENE_ART_INVALID_IDENTITY: missing sceneKey");
  }
  if (!promptHash) {
    throw new Error("SCENE_ART_INVALID_IDENTITY: missing promptHash");
  }

  const row = await prisma.sceneArt.findFirst({
    where: { sceneKey, promptHash },
    select: {
      sceneKey: true,
      promptHash: true,
      status: true,
      attemptCount: true,
      generationStartedAt: true,
      generationLeaseUntil: true,
      basePrompt: true,
      renderPrompt: true,
      stylePreset: true,
      renderMode: true,
      engineVersion: true,
    },
  });

  if (!row) {
    throw new Error(`runQueuedSceneArtGeneration: row missing for ${sceneKey}/${promptHash}`);
  }

  const leaseStartedAt = new Date();
  const leaseMs = getSceneArtWorkerRuntimeConfig().leaseMs;
  const leaseUntil = new Date(leaseStartedAt.getTime() + leaseMs);
  const workerId = getSceneArtWorkerId();
  const claimed = await prisma.sceneArt.updateMany({
    where: {
      sceneKey: row.sceneKey,
      promptHash: row.promptHash,
      status: SceneArtStatus.queued,
    },
    data: {
      status: SceneArtStatus.generating,
      leaseOwnerId: workerId,
      leaseAcquiredAt: leaseStartedAt,
      generationStartedAt: leaseStartedAt,
      generationLeaseUntil: leaseUntil,
      attemptCount: { increment: 1 },
    },
  });

  if (claimed.count !== 1) {
    return;
  }

  const claimedRow = await prisma.sceneArt.findUniqueOrThrow({
    where: {
      sceneKey: row.sceneKey,
      promptHash: row.promptHash,
    },
  });
  logSceneArtEvent("scene.art.claimed", {
    sceneKey: claimedRow.sceneKey,
    promptHash: claimedRow.promptHash,
    status: claimedRow.status,
    attemptCount: claimedRow.attemptCount ?? 0,
    generationStartedAt: claimedRow.generationStartedAt ?? null,
    generationLeaseUntil: claimedRow.generationLeaseUntil ?? null,
    leaseOwnerId: claimedRow.leaseOwnerId ?? null,
    leaseAcquiredAt: claimedRow.leaseAcquiredAt ?? null,
  });

  const context = buildExecutionContext(claimedRow);
  try {
    const updated = await generateSceneArtForExecutionContext(context, { force: true });
    return attemptResultFromRow(updated);
  } catch (error) {
    const updated = await prisma.sceneArt.findUniqueOrThrow({
      where: {
        sceneKey: row.sceneKey,
        promptHash: row.promptHash,
      },
    });
    const attemptResult = attemptResultFromRow(updated);
    const attemptError = (error as SceneArtAttemptError) || new Error(String(error));
    attemptError.attemptResult = attemptResult;
    throw attemptError;
  }
}
