import type { SceneActorState } from "@/lib/resolveSceneActorState";
import type { SceneFocusState } from "@/lib/resolveSceneFocusState";
import type { SceneSubjectState } from "@/lib/resolveSceneSubjectState";
import type { SceneFramingState } from "@/lib/resolveSceneFramingState";

export type SceneSpatialSubject = "player" | "threat" | "object" | "environment";
export type SceneSpatialDominance = "balanced" | "primary-heavy";

export type SceneSpatialHierarchy = {
  primarySubject: SceneSpatialSubject;
  secondarySubject: SceneSpatialSubject | null;
  dominance: SceneSpatialDominance;
};

type ResolveSceneSpatialHierarchyArgs = {
  focusState: SceneFocusState;
  actorState: SceneActorState;
  subjectState: SceneSubjectState;
  framingState: SceneFramingState;
};

export function resolveSceneSpatialHierarchy({
  focusState,
  actorState,
  subjectState,
  framingState,
}: ResolveSceneSpatialHierarchyArgs): SceneSpatialHierarchy {
  const focus = focusState.focusType;
  const primary: SceneSpatialSubject = focus === "threat"
    ? "threat"
    : focus === "detail"
    ? "object"
    : focus === "environment"
    ? "environment"
    : "player";

  const actorPrimary = actorState.actorVisible && actorState.primaryActorRole === "threat" ? "threat" : null;
  const secondary: SceneSpatialSubject | null = actorPrimary && primary !== "threat" ? actorPrimary : null;

  const dominance: SceneSpatialDominance = framingState.subjectFocus === "threat" || primary === "threat" ? "primary-heavy" : "balanced";

  return {
    primarySubject: primary,
    secondarySubject: secondary,
    dominance,
  };
}
