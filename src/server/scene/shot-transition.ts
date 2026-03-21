import type { SceneCameraContinuityState, SceneCameraMemory, SceneTransitionMemory } from "@/lib/sceneTypes";
import { EMPTY_SCENE_TRANSITION_MEMORY } from "@/lib/sceneTypes";
import type { SceneDeltaKind } from "@/lib/resolveSceneDeltaKind";

export type ShotTransitionArgs = {
  deltaKind: SceneDeltaKind;
  sameScene: boolean;
  shotDuration: number;
  transitionMemory: SceneTransitionMemory;
  continuityState: SceneCameraContinuityState;
  nextCameraMemory: SceneCameraMemory | null;
};

export function applyShotTransitionRules(args: ShotTransitionArgs) {
  const {
    deltaKind,
    sameScene,
    shotDuration,
    transitionMemory,
    continuityState,
    nextCameraMemory,
  } = args;

  if (deltaKind === "full") {
    const nextState: SceneCameraContinuityState = {
      ...continuityState,
      consecutiveAdvances: 0,
      cameraMemory: null,
      directorMemory: null,
    };
    const nextTransition = { ...EMPTY_SCENE_TRANSITION_MEMORY };
    if (nextState.cameraMemory || nextState.directorMemory) {
      throw new Error("SHOT_TRANSITION_INVARIANT_VIOLATION: full delta must drop previous shot state");
    }
    return {
      transitionMemory: nextTransition,
      continuityState: nextState,
    };
  }

  const normalizedContinuityState: SceneCameraContinuityState = {
    ...continuityState,
    cameraMemory: nextCameraMemory ?? continuityState.cameraMemory,
  };

  if (!sameScene) {
    return {
      transitionMemory,
      continuityState: normalizedContinuityState,
    };
  }

  if (deltaKind === "partial") {
    return {
      transitionMemory: {
        preserveFraming: false,
        preserveSubject: true,
        preserveActor: true,
        preserveFocus: true,
      },
      continuityState: normalizedContinuityState,
    };
  }

  if (deltaKind === "none") {
    const longHold = shotDuration >= 3;
    return {
      transitionMemory: {
        preserveFraming: !longHold,
        preserveSubject: true,
        preserveActor: true,
        preserveFocus: true,
      },
      continuityState: normalizedContinuityState,
    };
  }

  return {
    transitionMemory,
    continuityState: normalizedContinuityState,
  };
}
