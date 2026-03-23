import { SceneArtStatus } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { SceneArtIdentity, SceneArtIdentityInput, getSceneArtIdentity } from "@/lib/sceneArtIdentity";
import { loadOrCreateSceneArt } from "@/lib/scene-art/loadOrCreateSceneArt";
import { runQueuedSceneArtGeneration } from "@/lib/scene-art/runQueuedSceneArtGeneration";
import { logSceneArtEvent } from "@/lib/scene-art/logging";

export type QueueSceneArtGenerationOptions = {
  force?: boolean;
  autoProcess?: boolean;
};

export type QueueSceneArtResult = {
  status: "pending" | "generating" | "ready" | "failed" | "missing";
  promptHash: string;
  imageUrl: string | null;
};

export async function queueSceneArtGeneration(
  input: SceneArtIdentityInput,
  options: QueueSceneArtGenerationOptions = {},
): Promise<QueueSceneArtResult> {
  const now = new Date();
  const identity = getSceneArtIdentity(input);
  const { row } = await loadOrCreateSceneArt(input);
  const imageUrl = row.imageUrl ?? null;
  const isReady = row.status === SceneArtStatus.ready;
  const hasImage = Boolean(imageUrl);

  if (isReady && hasImage && !options.force) {
    return {
      status: "ready",
      promptHash: identity.promptHash,
      imageUrl,
    };
  }

  if (isReady && !hasImage && !options.force) {
    return {
      status: "missing",
      promptHash: identity.promptHash,
      imageUrl,
    };
  }

  if (row.status === SceneArtStatus.generating) {
    const lease = row.generationLeaseUntil;
    if (lease && lease > now) {
      return {
        status: "generating",
        promptHash: identity.promptHash,
        imageUrl,
      };
    }

    await prisma.sceneArt.update({
      where: {
        sceneKey_promptHash: {
          sceneKey: identity.sceneKey,
          promptHash: identity.promptHash,
        },
      },
      data: {
        status: SceneArtStatus.queued,
        generationStartedAt: null,
        generationLeaseUntil: null,
      },
    });
    logSceneArtEvent("scene.art.reclaimed", {
      sceneKey: identity.sceneKey,
      promptHash: identity.promptHash,
      status: SceneArtStatus.queued,
      attemptCount: row.attemptCount ?? 0,
      generationStartedAt: row.generationStartedAt ?? null,
      generationLeaseUntil: row.generationLeaseUntil ?? null,
    });
  }

  if (row.status === SceneArtStatus.failed && !options.force) {
    return {
      status: "failed",
      promptHash: identity.promptHash,
      imageUrl,
    };
  }

  await prisma.sceneArt.update({
    where: {
      sceneKey_promptHash: {
        sceneKey: identity.sceneKey,
        promptHash: identity.promptHash,
      },
    },
    data: {
      status: SceneArtStatus.queued,
    },
  });

  const queuedRow = await prisma.sceneArt.findUniqueOrThrow({
    where: {
      sceneKey_promptHash: {
        sceneKey: identity.sceneKey,
        promptHash: identity.promptHash,
      },
    },
  });

  logSceneArtEvent("scene.art.queued", {
    sceneKey: identity.sceneKey,
    promptHash: identity.promptHash,
    status: queuedRow.status,
    attemptCount: queuedRow.attemptCount ?? 0,
    generationLeaseUntil: queuedRow.generationLeaseUntil ?? null,
  });

  if (options.autoProcess !== false) {
    void runQueuedSceneArtGeneration(identity.promptHash).catch(() => {
      /* swallow to avoid unhandled rejection when caller is already running the executor */
    });
  }

  return {
    status: "pending",
    promptHash: identity.promptHash,
    imageUrl,
  };
}
