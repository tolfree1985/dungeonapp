import type { SceneActorState } from "@/lib/resolveSceneActorState";
import type { SceneFramingState } from "@/lib/resolveSceneFramingState";
import type { SceneSubjectState } from "@/lib/resolveSceneSubjectState";
import type { SceneVisualState } from "@/lib/resolveSceneVisualState";

export type SceneDeltaKind =
  | "none"
  | "text-only"
  | "motif"
  | "lighting-change"
  | "composition-change"
  | "camera-change"
  | "environment"
  | "partial"
  | "full";

export type SceneDeltaSnapshot = {
  sceneKey: string | null;
  visualState: SceneVisualState;
  framingState: SceneFramingState;
  subjectState: SceneSubjectState;
  actorState: SceneActorState;
  basePrompt: string;
  canonicalTags: string[];
};

function tagsEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const set = new Set(left);
  for (const tag of right) {
    if (!set.has(tag)) return false;
  }
  return true;
}

function visualEquals(prev: SceneVisualState, next: SceneVisualState) {
  return (
    prev.locationId === next.locationId &&
    prev.timeValue === next.timeValue &&
    prev.pressureStage === next.pressureStage &&
    prev.lightingState === next.lightingState &&
    prev.atmosphereState === next.atmosphereState &&
    prev.environmentWear === next.environmentWear &&
    prev.threatPresence === next.threatPresence
  );
}

function framingEquals(prev: SceneFramingState, next: SceneFramingState) {
  return (
    prev.frameKind === next.frameKind &&
    prev.shotScale === next.shotScale &&
    prev.cameraAngle === next.cameraAngle &&
    prev.subjectFocus === next.subjectFocus
  );
}

function subjectEquals(prev: SceneSubjectState, next: SceneSubjectState) {
  return (
    prev.primarySubjectKind === next.primarySubjectKind &&
    prev.primarySubjectLabel === next.primarySubjectLabel
  );
}

export function resolveSceneDeltaKind(
  previous: SceneDeltaSnapshot | null,
  current: SceneDeltaSnapshot | null,
): SceneDeltaKind {
  if (!current || !previous) {
    return "full";
  }

  const visualSame = visualEquals(previous.visualState, current.visualState);
  const framingSame = framingEquals(previous.framingState, current.framingState);
  const subjectSame = subjectEquals(previous.subjectState, current.subjectState);
  const basePromptSame = previous.basePrompt === current.basePrompt;
  const tagsSame = tagsEqual(previous.canonicalTags, current.canonicalTags);

  if (visualSame && framingSame && subjectSame) {
    if (!basePromptSame) return "text-only";
    if (!tagsSame) return "motif";
    return "none";
  }

  if (!framingSame) {
    return "camera-change";
  }

  if (!subjectSame) {
    return "composition-change";
  }

  if (!visualSame) {
    if (
      previous.visualState.lightingState !== current.visualState.lightingState ||
      previous.visualState.atmosphereState !== current.visualState.atmosphereState
    ) {
      return "lighting-change";
    }
    if (
      previous.visualState.environmentWear !== current.visualState.environmentWear ||
      previous.visualState.threatPresence !== current.visualState.threatPresence
    ) {
      return "environment";
    }
  }

  return "full";
}
