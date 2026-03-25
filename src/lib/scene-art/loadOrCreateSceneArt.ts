import { prisma } from "@/lib/prisma";
import { SceneArtStatus } from "@/generated/prisma";
import type { SceneArt } from "@prisma/client";
import { getSceneArtIdentity } from "@/lib/sceneArtIdentity";
import { createSceneArtRow } from "@/lib/scene-art/sceneArtStore";
import { assertStoredSceneArtMatchesIdentity } from "@/lib/scene-art/assertStoredSceneArtMatchesIdentity";
import type { SceneArtIdentityInput, SceneArtIdentity } from "@/lib/sceneArtIdentity";
import { assertSceneArtIdentity } from "@/lib/scene-art/assertSceneArtIdentity";

export type LoadOrCreateSceneArtResult = {
  identity: SceneArtIdentity;
  row: SceneArt;
  created: boolean;
};

export async function loadOrCreateSceneArt(
  input: SceneArtIdentityInput,
): Promise<LoadOrCreateSceneArtResult> {
  const identity = getSceneArtIdentity(input);
  assertSceneArtIdentity(identity);
  const existing = await prisma.sceneArt.findUnique({
    where: {
      sceneKey_promptHash: {
        sceneKey: identity.sceneKey,
        promptHash: identity.promptHash,
      },
    },
  });
  if (existing) {
    if (existing.status === SceneArtStatus.ready && existing.imageUrl) {
      assertStoredSceneArtMatchesIdentity(existing, identity);
    }
    return { identity, row: existing, created: false };
  }
  const created = await createSceneArtRow(identity);
  return { identity, row: created, created: true };
}
