import type { Turn } from "@prisma/client";
import { buildCanonicalSceneArtPayload } from "@/lib/canonicalSceneArtPayload";
import { findSceneArt } from "@/lib/sceneArtRepo";
import type { SceneContinuityInfo } from "@/lib/sceneContinuityInfo";
import type { PreviousSceneContinuity } from "@/lib/resolveTurnSceneArtPresentation";

export type HydrateContinuityArgs = {
  previousTurn: Turn | null;
  previousStateRecord: Record<string, unknown> | null;
  previousSceneContinuityInfo: SceneContinuityInfo | null;
};

export async function hydrateContinuity({
  previousTurn,
  previousSceneContinuityInfo,
  previousStateRecord,
}: HydrateContinuityArgs): Promise<PreviousSceneContinuity> {
  const previousSceneCanonicalPayload =
    previousTurn && previousStateRecord
      ? buildCanonicalSceneArtPayload({
          turn: previousTurn,
          state: previousStateRecord,
        })
      : null;
  const previousSceneKeyFromCanonical = previousSceneCanonicalPayload?.sceneKey ?? null;
  const previousSceneKeyFromContinuity = previousSceneContinuityInfo?.sceneKey ?? null;
  const previousCanonicalKey = previousSceneKeyFromCanonical ?? previousSceneKeyFromContinuity ?? null;
  const previousSceneArtRow = previousCanonicalKey ? await findSceneArt(previousCanonicalKey) : null;
  const previousSceneKeyMismatch =
    Boolean(previousSceneContinuityInfo && previousSceneCanonicalPayload) &&
    previousSceneContinuityInfo.sceneKey !== previousSceneCanonicalPayload.sceneKey;
  const sceneArtMatchesPreviousCanonical =
    Boolean(previousSceneArtRow && previousCanonicalKey && previousSceneArtRow.sceneKey === previousCanonicalKey);
  const sceneArtKeyMismatch =
    previousSceneKeyMismatch ||
    Boolean(previousSceneArtRow && previousCanonicalKey && previousSceneArtRow.sceneKey !== previousCanonicalKey);

  return {
    sceneKey: previousCanonicalKey,
    canonicalPayload: previousSceneCanonicalPayload,
    sceneArt: sceneArtMatchesPreviousCanonical ? previousSceneArtRow : null,
    sceneArtKeyMismatch,
    shotKey: previousSceneContinuityInfo?.shotKey ?? null,
  };
}
