import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SceneArtStatus } from "@/generated/prisma";
import { GENERATION_LEASE_MS } from "@/lib/scene-art/constants";
import { SceneArtExecutionContext, generateSceneArtForExecutionContext } from "@/lib/scene-art/generateSceneArtForIdentity";
import { logSceneArtEvent } from "@/lib/scene-art/logging";

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

export async function runQueuedSceneArtGeneration(promptHash: string): Promise<void> {
  if (!promptHash) {
    throw new Error("SCENE_ART_INVALID_IDENTITY: missing promptHash");
  }

  const row = await prisma.sceneArt.findFirst({
    where: { promptHash },
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
    throw new Error(`runQueuedSceneArtGeneration: row missing for ${promptHash}`);
  }

  if (!row.sceneKey) {
    throw new Error("SCENE_ART_INVALID_IDENTITY: missing sceneKey");
  }

  if (!row.promptHash) {
    throw new Error("SCENE_ART_INVALID_IDENTITY: empty promptHash");
  }

  const leaseStartedAt = new Date();
  const leaseUntil = new Date(leaseStartedAt.getTime() + GENERATION_LEASE_MS);
  const claimed = await prisma.sceneArt.updateMany({
    where: {
      sceneKey: row.sceneKey,
      promptHash: row.promptHash,
      status: SceneArtStatus.queued,
    },
    data: {
      status: SceneArtStatus.generating,
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
  });

  const context = buildExecutionContext(claimedRow);
  await generateSceneArtForExecutionContext(context, { force: true });
}
