export type EncounterPhase =
  | "arrival"
  | "investigation"
  | "conversation"
  | "conflict"
  | "aftermath";

export type SceneIdentity = {
  locationKey: string;
  focalActorKey: string | null;
  objectiveKey: string | null;
  encounterPhase: EncounterPhase;
};

export type SceneChangeInputs = {
  previous: SceneIdentity | null;
  current: SceneIdentity;
  minutesElapsed: number;
  detailOnlyChange: boolean;
};

export function buildSceneKey(identity: SceneIdentity): string {
  return [
    identity.locationKey,
    identity.focalActorKey ?? "none",
    identity.objectiveKey ?? "none",
    identity.encounterPhase,
  ].join("::");
}

export function decideSceneDeltaKind(input: SceneChangeInputs): "none" | "partial" | "full" {
  if (!input.previous) {
    return "full";
  }
  if (input.detailOnlyChange) {
    return "none";
  }
  let score = 0;
  if (input.previous.locationKey !== input.current.locationKey) score += 4;
  if (input.previous.objectiveKey !== input.current.objectiveKey) score += 3;
  if (input.previous.focalActorKey !== input.current.focalActorKey) score += 2;
  if (input.previous.encounterPhase !== input.current.encounterPhase) score += 2;
  if (input.minutesElapsed >= 15) score += 2;
  if (score >= 4) return "full";
  if (score >= 1) return "partial";
  return "none";
}
