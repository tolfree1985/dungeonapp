import type { SceneTransitionMemory } from "./sceneTypes";

export type SceneDirectorBehavior = {
  preferThreatFraming: boolean;
  allowCut: boolean;
  forceHold: boolean;
  escalateCamera: boolean;
};

type Input = {
  transitionMemory: SceneTransitionMemory;
  visualState: {
    locationChanged?: boolean;
  };
  framingState: {
    scale?: string | null;
  };
  focusState: {
    primary?: string | null;
    detail?: string | null;
  };
  pressureStage?: string | null;
};

export function resolveSceneDirectorBehavior({
  transitionMemory,
  visualState,
  framingState,
  focusState,
  pressureStage,
}: Input): SceneDirectorBehavior {
  const highPressure = pressureStage === "danger" || pressureStage === "crisis";

  const preservedComposition =
    transitionMemory.preserveFraming &&
    transitionMemory.preserveSubject &&
    transitionMemory.preserveFocus;

  const focusedThreat =
    focusState.primary === "threat" ||
    focusState.detail === "enemy" ||
    focusState.detail === "weapon";

  const preferThreatFraming = highPressure || focusedThreat;

  const forceHold =
    preservedComposition &&
    !highPressure &&
    visualState.locationChanged !== true &&
    framingState.scale !== "wide";

  const allowCut =
    highPressure ||
    visualState.locationChanged === true ||
    framingState.scale === "wide";

  const escalateCamera =
    highPressure &&
    transitionMemory.preserveFraming &&
    !transitionMemory.preserveFocus;

  return {
    preferThreatFraming,
    allowCut,
    forceHold,
    escalateCamera,
  };
}
