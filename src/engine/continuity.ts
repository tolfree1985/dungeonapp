import type { Turn } from "@prisma/client";
import { buildCanonicalSceneArtPayload } from "@/lib/canonicalSceneArtPayload";
import { buildSceneArtLookupIdentity, findSceneArt } from "@/lib/sceneArtRepo";
import type { SceneArtPayload } from "@/lib/sceneArt";
import type { SceneContinuityInfo } from "@/lib/sceneContinuityInfo";
import type { PreviousSceneContinuity } from "@/lib/resolveTurnSceneArtPresentation";

export type HydrateContinuityArgs = {
  previousTurn: Turn | null;
  previousStateRecord: Record<string, unknown> | null;
  previousSceneContinuityInfo: SceneContinuityInfo | null;
  previousTurnDebug: Record<string, unknown> | null;
};

export async function hydrateContinuity({
  previousTurn,
  previousSceneContinuityInfo,
  previousStateRecord,
  previousTurnDebug,
}: HydrateContinuityArgs): Promise<PreviousSceneContinuity> {
  const canonicalFromState =
    previousTurn && previousStateRecord
      ? buildCanonicalSceneArtPayload({
          turn: previousTurn,
          state: previousStateRecord,
        })
      : null;
  const canonicalPayloadFromDebug =
    previousTurnDebug && typeof previousTurnDebug.canonicalPayload === "object"
      ? (previousTurnDebug.canonicalPayload as SceneArtPayload)
      : null;
  const previousSceneCanonicalPayload = canonicalPayloadFromDebug ?? canonicalFromState;
  const previousSceneKeyFromCanonical = previousSceneCanonicalPayload?.sceneKey ?? null;
  const previousSceneKeyFromContinuity = previousSceneContinuityInfo?.sceneKey ?? null;
  const previousCanonicalKey = previousSceneKeyFromCanonical ?? previousSceneKeyFromContinuity ?? null;
  const previousDebugSceneArt =
    previousTurnDebug && typeof previousTurnDebug.sceneArt === "object"
      ? (previousTurnDebug.sceneArt as { sceneKey: string; promptHash: string })
      : null;
  const previousSceneArtIdentity =
    previousDebugSceneArt && previousDebugSceneArt.sceneKey && previousDebugSceneArt.promptHash
      ? { sceneKey: previousDebugSceneArt.sceneKey, promptHash: previousDebugSceneArt.promptHash }
      : previousSceneCanonicalPayload
      ? buildSceneArtLookupIdentity(previousSceneCanonicalPayload)
      : null;
  const previousSceneArtRow = previousSceneArtIdentity
    ? await findSceneArt(previousSceneArtIdentity)
    : null;
  const previousSceneKeyMismatch =
    Boolean(previousSceneContinuityInfo && previousSceneCanonicalPayload) &&
    previousSceneContinuityInfo.sceneKey !== previousSceneCanonicalPayload.sceneKey;
  const sceneArtMatchesPreviousCanonical =
    Boolean(previousSceneArtRow && previousCanonicalKey && previousSceneArtRow.sceneKey === previousCanonicalKey);
  const sceneArtKeyMismatch =
    previousSceneKeyMismatch ||
    Boolean(previousSceneArtRow && previousCanonicalKey && previousSceneArtRow.sceneKey !== previousCanonicalKey);

  console.log("scene.debug.hydrate.source", {
    previousTurnIndex: previousTurn?.turnIndex ?? null,
    previousTurnDebug: previousTurnDebug ?? null,
    previousCanonicalKey,
    previousSceneArtist: previousSceneArtRow
      ? { sceneKey: previousSceneArtRow.sceneKey, promptHash: previousSceneArtRow.promptHash }
      : null,
  });

  return {
    sceneKey: previousCanonicalKey,
    canonicalPayload: previousSceneCanonicalPayload,
    sceneArt: sceneArtMatchesPreviousCanonical ? previousSceneArtRow : null,
    sceneArtKeyMismatch,
    shotKey: previousSceneContinuityInfo?.shotKey ?? null,
  };
}
