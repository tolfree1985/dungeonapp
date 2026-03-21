import type { SceneFramingState } from "@/lib/resolveSceneFramingState";
import type { SceneCompositionBias } from "@/lib/resolveSceneCompositionBias";

export type SceneTransitionMemory = {
  preserveFraming: boolean;
  preserveSubject: boolean;
  preserveActor: boolean;
  preserveFocus: boolean;
};

export const EMPTY_SCENE_TRANSITION_MEMORY: SceneTransitionMemory = {
  preserveFraming: false,
  preserveSubject: false,
  preserveActor: false,
  preserveFocus: false,
};

export type SceneShotIntent = "observe" | "inspect" | "threaten" | "reveal" | "isolate";

export type SceneDirectorMemory = {
  shotScale: SceneFramingState["shotScale"];
  cameraAngle: "high" | "eye" | "low";
  focusSubject: "environment" | "threat" | "actor" | "object";
  compositionBias: SceneCompositionBias["balance"];
  emphasis: SceneShotIntent;
};

export type SceneCameraMemory = {
  shotScale: SceneFramingState["shotScale"];
  cameraAngle: SceneFramingState["cameraAngle"];
  frameKind: SceneFramingState["frameKind"];
  subjectFocus: SceneFramingState["subjectFocus"] | null;
};

export type SceneCameraContinuityState = {
  consecutiveAdvances: number;
  cameraMemory: SceneCameraMemory | null;
  directorMemory: SceneDirectorMemory | null;
};

export const INITIAL_SCENE_CAMERA_CONTINUITY: SceneCameraContinuityState = {
  consecutiveAdvances: 0,
  cameraMemory: null,
  directorMemory: null,
};
