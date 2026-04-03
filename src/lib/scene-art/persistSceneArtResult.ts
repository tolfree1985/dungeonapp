import { prisma } from "@/lib/prisma";

export type FinalizeSceneArtResult = {
  sceneKey: string;
  promptHash: string;
  status: "ready" | "retryable" | "failed";
  imageUrl?: string | null;
  lastError?: string | null;
};

export async function persistSceneArtResult(input: FinalizeSceneArtResult) {
  console.log("scene.art.worker.persist.attempt", {
    sceneKey: input.sceneKey,
    promptHash: input.promptHash,
    status: input.status,
    hasImageUrl: Boolean(input.imageUrl),
  });
  const updated = await prisma.sceneArt.update({
    where: {
      sceneKey_promptHash: {
        sceneKey: input.sceneKey,
        promptHash: input.promptHash,
      },
    },
    data: {
      status: input.status,
      imageUrl: input.status === "ready" ? input.imageUrl ?? null : null,
      lastProviderFailureReason: input.status !== "ready" ? input.lastError ?? null : null,
      lastProviderFailureClass: input.status !== "ready" ? "provider_error" : null,
      lastProviderRetryable: input.status === "retryable",
      generationLeaseUntil: null,
      leaseOwnerId: null,
    },
  });
  console.log("scene.art.worker.persist.ready", {
    sceneKey: input.sceneKey,
    promptHash: input.promptHash,
    status: input.status,
    imageUrl: updated.imageUrl ?? null,
  });
  return updated;
}
