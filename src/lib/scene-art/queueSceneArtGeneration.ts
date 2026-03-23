import { SceneArtStatus } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { SceneArtIdentity, SceneArtIdentityInput, getSceneArtIdentity } from "@/lib/sceneArtIdentity";
import { loadOrCreateSceneArt } from "@/lib/scene-art/loadOrCreateSceneArt";
import { processSceneArtGeneration } from "@/lib/scene-art/processSceneArtGeneration";
import { GENERATION_LEASE_MS } from "@/lib/scene-art/constants";

export type QueueSceneArtGenerationOptions = {
  force?: boolean;
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

  void processSceneArtGeneration(identity);

  return {
    status: "pending",
    promptHash: identity.promptHash,
    imageUrl,
  };
}
