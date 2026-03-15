import type { SceneFramingState } from "@/lib/resolveSceneFramingState";
import type { SceneSubjectState } from "@/lib/resolveSceneSubjectState";
import type { SceneActorState } from "@/lib/resolveSceneActorState";
import type { SceneFocusState } from "@/lib/resolveSceneFocusState";

export type SceneTransitionMemory = {
  preserveFraming: boolean;
  preserveSubject: boolean;
  preserveActor: boolean;
  preserveFocus: boolean;
};

type Args = {
  previousFraming: SceneFramingState | null;
  previousSubject: SceneSubjectState | null;
  previousActor: SceneActorState | null;
  previousFocus: SceneFocusState | null;
  currentFraming: SceneFramingState;
  currentSubject: SceneSubjectState;
  currentActor: SceneActorState;
  currentFocus: SceneFocusState;
};

export function resolveSceneTransitionMemory({
  previousFraming,
  previousSubject,
  previousActor,
  previousFocus,
  currentFraming,
  currentSubject,
  currentActor,
  currentFocus,
}: Args): SceneTransitionMemory {
  const preserveFraming =
    Boolean(previousFraming) &&
    previousFraming.frameKind === currentFraming.frameKind &&
    previousFraming.shotScale === currentFraming.shotScale &&
    previousFraming.cameraAngle === currentFraming.cameraAngle;

  const preserveSubject =
    Boolean(previousSubject) &&
    previousSubject.primarySubjectKind === currentSubject.primarySubjectKind &&
    (previousSubject.primarySubjectId ?? previousSubject.primarySubjectLabel ?? null) ===
      (currentSubject.primarySubjectId ?? currentSubject.primarySubjectLabel ?? null);

  const preserveActor =
    Boolean(previousActor) &&
    (previousActor.primaryActorId ?? null) !== null &&
    (previousActor.primaryActorId ?? null) === (currentActor.primaryActorId ?? null);

  const preserveFocus =
    Boolean(previousFocus) &&
    previousFocus.focusType === currentFocus.focusType &&
    (previousFocus.focusId ?? previousFocus.focusLabel ?? null) ===
      (currentFocus.focusId ?? currentFocus.focusLabel ?? null);

  return {
    preserveFraming,
    preserveSubject,
    preserveActor,
    preserveFocus,
  };
}
