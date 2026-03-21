import type { SceneFramingState } from "@/lib/resolveSceneFramingState";
import type { SceneFocusState } from "@/lib/resolveSceneFocusState";
import type { SceneTransition } from "@/lib/resolveSceneTransition";
import type {
  SceneCameraContinuityState,
  SceneTransitionMemory,
} from "@/lib/sceneTypes";

const SCALE_ORDER = ["wide", "medium", "close"] as const;

export type SceneCameraEscalationDecision = {
  shouldEscalateCamera: boolean;
  nextContinuityState: SceneCameraContinuityState;
  preferredScaleDelta: 0 | 1;
};

export type ResolveSceneCameraEscalationDecisionArgs = {
  transitionType: SceneTransition["type"] | null;
  transitionMemory?: SceneTransitionMemory | null;
  currentFraming: SceneFramingState;
  currentFocus: SceneFocusState;
  pressureStage?: string | null;
  previousContinuityState?: SceneCameraContinuityState | null;
};

export function resolveSceneCameraEscalationDecision(
  args: ResolveSceneCameraEscalationDecisionArgs,
): SceneCameraEscalationDecision {
  const {
    transitionType,
    transitionMemory,
    currentFraming,
    currentFocus,
    pressureStage,
    previousContinuityState,
  } = args;

  const counter = previousContinuityState?.consecutiveAdvances ?? 0;
  const isAdvance = transitionType === "advance";

  if (!isAdvance) {
    return {
      shouldEscalateCamera: false,
    nextContinuityState: {
      consecutiveAdvances: 0,
      cameraMemory: previousContinuityState?.cameraMemory ?? null,
      directorMemory: previousContinuityState?.directorMemory ?? null,
    },
      preferredScaleDelta: 0,
    };
  }

  const nextCounter = counter + 1;
  const highPressure = pressureStage === "danger" || pressureStage === "crisis";
  const memory = transitionMemory ?? null;
  const stableFraming = memory?.preserveFraming ?? false;
  const focusChanged = memory ? !memory.preserveFocus : false;
  const meaningfulFocus = currentFocus.focusType !== "environment";
  const scaleIndex = SCALE_ORDER.indexOf(currentFraming.shotScale);
  const canTighten = scaleIndex >= 0 && scaleIndex < SCALE_ORDER.length - 1;

  const shouldEscalateCamera =
    highPressure &&
    nextCounter >= 2 &&
    stableFraming &&
    focusChanged &&
    meaningfulFocus &&
    canTighten;

  return {
    shouldEscalateCamera,
    nextContinuityState: {
      consecutiveAdvances: nextCounter,
      cameraMemory: previousContinuityState?.cameraMemory ?? null,
      directorMemory: previousContinuityState?.directorMemory ?? null,
    },
    preferredScaleDelta: shouldEscalateCamera ? 1 : 0,
  };
}
