import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SceneArtStatus } from "@/generated/prisma";
import { SceneArtExecutionContext, generateSceneArtForExecutionContext } from "@/lib/scene-art/generateSceneArtForIdentity";
import { logSceneArtEvent } from "@/lib/scene-art/logging";
import { getSceneArtWorkerId } from "@/lib/scene-art/workerIdentity";
import { findSceneArt } from "@/lib/sceneArtRepo";
import { getLeaseDurationMs } from "@/lib/scene-art/sceneArtLease";

export type SceneArtIdentityInput = {
  sceneKey: string;
  promptHash: string;
};

type SceneArtRow = Prisma.SceneArtGetPayload<{}>;

export type RunQueuedSceneArtGenerationInput = SceneArtIdentityInput & {
  skipClaim?: boolean;
  claimedRow?: SceneArtRow | null;
  workerId?: string;
};

function buildExecutionContext(row: Prisma.SceneArtGetPayload<{}>, workerId: string): SceneArtExecutionContext {
  return {
    sceneKey: row.sceneKey,
    promptHash: row.promptHash,
    basePrompt: row.basePrompt,
    renderPrompt: row.renderPrompt,
    stylePreset: row.stylePreset,
    renderMode: row.renderMode,
    engineVersion: row.engineVersion,
    workerId,
  };
}

export type SceneArtAttemptOutcome = "ready" | "queued" | "failed";

export type SceneArtAttemptResult = {
  sceneKey: string;
  promptHash: string;
  lastAttemptCostUsd: number;
  outcome: SceneArtAttemptOutcome;
  billable: boolean;
};

export interface SceneArtAttemptError extends Error {
  attemptResult?: SceneArtAttemptResult;
}

function attemptResultFromRow(row: SceneArtRow, outcome: SceneArtAttemptOutcome): SceneArtAttemptResult {
  return {
    sceneKey: row.sceneKey,
    promptHash: row.promptHash,
    lastAttemptCostUsd: row.lastAttemptCostUsd ?? 0,
    outcome,
    billable: true,
  };
}

export async function runQueuedSceneArtGeneration(
  input: RunQueuedSceneArtGenerationInput,
): Promise<SceneArtAttemptResult | null> {
  const {
    sceneKey,
    promptHash,
    skipClaim = false,
    claimedRow: preclaimedRow,
    workerId,
  } = input;

  if (!sceneKey) {
    throw new Error("SCENE_ART_INVALID_IDENTITY: missing sceneKey");
  }
  if (!promptHash) {
    throw new Error("SCENE_ART_INVALID_IDENTITY: missing promptHash");
  }

  let row = preclaimedRow;
  if (!row) {
    row = await prisma.sceneArt.findFirst({
      where: { sceneKey, promptHash },
      select: {
        id: true,
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
        leaseOwnerId: true,
      },
    });
  }

  if (!row) {
    throw new Error(`runQueuedSceneArtGeneration: row missing for ${sceneKey}/${promptHash}`);
  }

  const resolvedWorkerId = workerId ?? getSceneArtWorkerId();

  if (!skipClaim) {
    const leaseStartedAt = new Date();
    const leaseUntil = new Date(leaseStartedAt.getTime() + getLeaseDurationMs());
    const claimed = await prisma.sceneArt.updateMany({
      where: {
        sceneKey: row.sceneKey,
        promptHash: row.promptHash,
        status: SceneArtStatus.queued,
        OR: [
          { generationLeaseUntil: null },
          { generationLeaseUntil: { lt: new Date() } },
        ],
      },
      data: {
        status: SceneArtStatus.generating,
        leaseOwnerId: resolvedWorkerId,
        leaseAcquiredAt: leaseStartedAt,
        generationStartedAt: leaseStartedAt,
        generationLeaseUntil: leaseUntil,
        attemptCount: { increment: 1 },
      },
    });

    if (claimed.count !== 1) {
      return null;
    }

    const updatedRow = await findSceneArt({
      sceneKey: row.sceneKey,
      promptHash: row.promptHash,
    });
    if (!updatedRow) {
      throw new Error(`runQueuedSceneArtGeneration: row missing after claim ${row.sceneKey}/${row.promptHash}`);
    }
    row = updatedRow;
  } else if (row.status !== SceneArtStatus.generating) {
    return null;
  } else if (row.leaseOwnerId && row.leaseOwnerId !== resolvedWorkerId) {
    return null;
  }
  const claimedRow = row;
  console.log("scene.art.worker.claim.updated", {
    id: claimedRow.id,
    sceneKey: claimedRow.sceneKey,
    promptHash: claimedRow.promptHash,
    status: claimedRow.status,
    leaseOwnerId: claimedRow.leaseOwnerId,
    generationLeaseUntil: claimedRow.generationLeaseUntil,
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

  const context = buildExecutionContext(claimedRow, resolvedWorkerId);
  try {
    console.log("scene.art.worker.provider.request", {
      id: claimedRow.id,
      sceneKey: claimedRow.sceneKey,
      promptHash: claimedRow.promptHash,
    });
    const updated = await generateSceneArtForExecutionContext(context, { force: true });
    console.log("scene.art.worker.provider.success", {
      id: claimedRow.id,
      sceneKey: claimedRow.sceneKey,
      promptHash: claimedRow.promptHash,
      imageUrl: updated.imageUrl,
    });
    console.log("scene.art.worker.persist.ready", {
      id: updated.id,
      sceneKey: updated.sceneKey,
      promptHash: updated.promptHash,
      status: updated.status,
      imageUrl: updated.imageUrl,
    });
    return attemptResultFromRow(updated, "ready");
  } catch (error) {
    console.error("scene.art.worker.provider.failure", {
      id: claimedRow.id,
      sceneKey: claimedRow.sceneKey,
      promptHash: claimedRow.promptHash,
      error: error instanceof Error ? error.message : String(error),
    });
    const updated = await findSceneArt({
      sceneKey: row.sceneKey,
      promptHash: row.promptHash,
    });
    if (!updated) {
      throw new Error(`runQueuedSceneArtGeneration: row missing after failure ${row.sceneKey}/${row.promptHash}`);
    }
    const attemptResult = attemptResultFromRow(updated, updated.status === SceneArtStatus.queued ? "queued" : "failed");
    return attemptResult;
    }
  }
