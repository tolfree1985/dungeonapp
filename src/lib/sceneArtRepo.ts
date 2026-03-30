import { prisma } from "@/lib/prisma";
import { buildPromptHash } from "@/lib/sceneArtGenerator";
import type { SceneArtPayload } from "@/lib/sceneArt";
import { ENGINE_VERSION } from "@/lib/game/engineVersion";
import type { SceneArt } from "@/generated/prisma";
import { SceneArtPriority, SceneArtStatus } from "@/generated/prisma";

export type RenderMode = "full" | "partial";

export type SceneArtLookupIdentity = {
  sceneKey: string;
  promptHash: string;
};

export function buildSceneArtLookupIdentity(payload: SceneArtPayload): SceneArtLookupIdentity {
  return {
    sceneKey: payload.sceneKey,
    promptHash: payload.promptHash,
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
  if (!payload.promptHash) {
    throw new Error("scene-art invariant violated: payload missing promptHash");
  }
  const identity = buildSceneArtLookupIdentity(payload);
  console.info("scene.render.queue_request", {
    sceneKey: payload.sceneKey,
    renderMode,
  });
  const canonicalUrl = buildCanonicalSceneArtUrl(identity.sceneKey, identity.promptHash);
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const existing = await tx.sceneArt.findUnique({
      where: {
        sceneKey_promptHash: {
          sceneKey: identity.sceneKey,
          promptHash: identity.promptHash,
        },
      },
    });

    if (!existing) {
      const created = await tx.sceneArt.create({
        data: {
          sceneKey: identity.sceneKey,
          promptHash: identity.promptHash,
          title: payload.title ?? null,
          basePrompt: payload.basePrompt,
          renderPrompt: payload.renderPrompt,
          stylePreset: payload.stylePreset,
          tagsJson: JSON.stringify(payload.tags ?? []),
          status: SceneArtStatus.queued,
          imageUrl: canonicalUrl,
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
      logQueuePersisted(created);
      return created;
    }

    if (existing.status === SceneArtStatus.ready) {
      return existing;
    }

    if (existing.status === SceneArtStatus.queued) {
      return existing;
    }

    if (existing.status === SceneArtStatus.generating) {
      if (existing.generationLeaseUntil && existing.generationLeaseUntil > new Date()) {
        return existing;
      }
    }

    if (existing.status === SceneArtStatus.failed && !existing.lastProviderRetryable) {
      return existing;
    }

    const updated = await tx.sceneArt.update({
      where: { id: existing.id },
      data: {
        status: SceneArtStatus.queued,
        imageUrl: canonicalUrl,
        renderMode,
        generationStartedAt: null,
        generationLeaseUntil: null,
        leaseOwnerId: null,
        leaseAcquiredAt: null,
        lastRecoveredAt: now,
      },
    });
    logQueuePersisted(updated);
    return updated;
  });
}

function logQueuePersisted(sceneArt: SceneArt) {
  console.log("scene.art.queue.persisted", {
    sceneKey: sceneArt.sceneKey,
    promptHash: sceneArt.promptHash,
    status: sceneArt.status,
    attemptCount: sceneArt.attemptCount,
    generationStartedAt: sceneArt.generationStartedAt,
    generationLeaseUntil: sceneArt.generationLeaseUntil,
    leaseOwnerId: sceneArt.leaseOwnerId,
    leaseAcquiredAt: sceneArt.leaseAcquiredAt,
  });
}

function buildCanonicalSceneArtUrl(sceneKey: string, promptHash: string) {
  return `/scene-art/${sceneKey}-${promptHash}.png`;
}
