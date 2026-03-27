import { prisma } from "@/lib/prisma";
import { buildPromptHash } from "@/lib/sceneArtGenerator";
import type { SceneArtPayload } from "@/lib/sceneArt";
import { ENGINE_VERSION } from "@/lib/game/engineVersion";
import { SceneArtPriority, SceneArtStatus } from "@/generated/prisma";

export type RenderMode = "full" | "partial";

export type SceneArtLookupIdentity = {
  sceneKey: string;
  promptHash: string;
};

export function buildSceneArtLookupIdentity(payload: SceneArtPayload): SceneArtLookupIdentity {
  return {
    sceneKey: payload.sceneKey,
    promptHash: buildPromptHash(payload.basePrompt, ENGINE_VERSION),
  };
}

export async function findSceneArt(identity: SceneArtLookupIdentity) {
  return prisma.sceneArt.findUnique({
    where: {
      sceneKey_promptHash: {
        sceneKey: identity.sceneKey,
        promptHash: identity.promptHash,
      },
    },
  });
}

export async function queueSceneArt(
  payload: SceneArtPayload,
  engineVersion?: string | null,
  renderPriority: SceneArtPriority = "normal",
  renderMode: RenderMode = "full",
) {
  const identity = buildSceneArtLookupIdentity(payload);
  console.info("scene.render.queue_request", {
    sceneKey: payload.sceneKey,
    renderMode,
  });
  const now = new Date();

  const upserted = await prisma.sceneArt.upsert({
    where: {
      sceneKey_promptHash: {
        sceneKey: identity.sceneKey,
        promptHash: identity.promptHash,
      },
    },
    update: {
      status: SceneArtStatus.queued,
      renderMode,
      generationStartedAt: null,
      generationLeaseUntil: null,
      leaseOwnerId: null,
      leaseAcquiredAt: null,
      lastRecoveredAt: now,
    },
    create: {
      sceneKey: identity.sceneKey,
      promptHash: identity.promptHash,
      title: payload.title ?? null,
      basePrompt: payload.basePrompt,
      renderPrompt: payload.renderPrompt,
      stylePreset: payload.stylePreset,
      tagsJson: JSON.stringify(payload.tags ?? []),
      status: SceneArtStatus.queued,
      imageUrl: null,
      engineVersion: engineVersion ?? null,
      renderPriority,
      renderMode,
      generationStartedAt: null,
      generationLeaseUntil: null,
      leaseOwnerId: null,
      leaseAcquiredAt: null,
      lastRecoveredAt: now,
    },
  });
  console.log("scene.art.queue.persisted", {
    sceneKey: upserted.sceneKey,
    promptHash: upserted.promptHash,
    status: upserted.status,
    attemptCount: upserted.attemptCount,
    generationStartedAt: upserted.generationStartedAt,
    generationLeaseUntil: upserted.generationLeaseUntil,
    leaseOwnerId: upserted.leaseOwnerId,
    leaseAcquiredAt: upserted.leaseAcquiredAt,
  });
  return upserted;
}
