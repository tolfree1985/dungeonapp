import type { SceneVisualState } from "@/lib/resolveSceneVisualState";
import type { SceneFramingState } from "@/lib/resolveSceneFramingState";
import type { SceneSubjectState } from "@/lib/resolveSceneSubjectState";
import type { SceneActorState } from "@/lib/resolveSceneActorState";
import type { SceneFocusState } from "@/lib/resolveSceneFocusState";
import type { SceneTransitionMemory } from "./sceneTypes";
import type { SceneDirectorBehavior } from "./resolveSceneDirectorBehavior";

export type SceneComposition = {
  visual: SceneVisualState;
  framing: SceneFramingState;
  subject: SceneSubjectState;
  actor: SceneActorState;
  focus: SceneFocusState;
};

type SceneTransitionType = "hold" | "advance" | "cut" | "reset";

export type SceneTransition = {
  type: SceneTransitionType;
  preserveFraming: boolean;
  preserveSubject: boolean;
  preserveActor: boolean;
  preserveFocus: boolean;
  focusHeld: boolean;
  shouldEscalateCamera?: boolean;
};

function equalsSubject(a: SceneSubjectState, b: SceneSubjectState) {
  return (
    a.primarySubjectKind === b.primarySubjectKind &&
    (a.primarySubjectLabel ?? null) === (b.primarySubjectLabel ?? null)
  );
}

function equalsActor(a: SceneActorState, b: SceneActorState) {
  if (a.primaryActorId && b.primaryActorId) {
    return a.primaryActorId === b.primaryActorId;
  }
  return a.primaryActorLabel === b.primaryActorLabel && a.actorVisible === b.actorVisible;
}

function equalsFocus(a: SceneFocusState, b: SceneFocusState) {
  return (
    a.focusType === b.focusType &&
    (a.focusId ?? null) === (b.focusId ?? null) &&
    (a.focusLabel ?? null) === (b.focusLabel ?? null)
  );
}

function equalsVisual(a: SceneVisualState, b: SceneVisualState) {
  return (
    a.locationId === b.locationId &&
    a.timeValue === b.timeValue &&
    a.pressureStage === b.pressureStage &&
    a.lightingState === b.lightingState &&
    a.atmosphereState === b.atmosphereState &&
    a.environmentWear === b.environmentWear &&
    a.threatPresence === b.threatPresence
  );
}

function equalsFraming(a: SceneFramingState, b: SceneFramingState) {
  return (
    a.frameKind === b.frameKind &&
    a.shotScale === b.shotScale &&
    a.subjectFocus === b.subjectFocus &&
    a.cameraAngle === b.cameraAngle
  );
}

export function resolveSceneTransition(args: {
  previous: SceneComposition | null;
  next: SceneComposition;
  memory?: SceneTransitionMemory | null;
  directorDecision?: SceneDirectorBehavior | null;
}): SceneTransition {
  const { previous, next } = args;
  const memory = args.memory ?? null;
  const directorDecision = args.directorDecision ?? null;
  if (!previous) {
    return {
      type: "cut",
      preserveFraming: false,
      preserveSubject: false,
      preserveActor: false,
      preserveFocus: false,
      focusHeld: false,
    };
  }

  const sameSubject = equalsSubject(previous.subject, next.subject);
  const sameActor = equalsActor(previous.actor, next.actor);
  const sameVisual = equalsVisual(previous.visual, next.visual);
  const sameFraming = equalsFraming(previous.framing, next.framing);
  const sameFocus = equalsFocus(previous.focus, next.focus);

  const preserveFraming = memory?.preserveFraming ?? sameFraming;
  const preserveSubject = memory?.preserveSubject ?? sameSubject;
  const preserveActor = memory?.preserveActor ?? sameActor;
  const preserveFocus = memory?.preserveFocus ?? sameFocus;

  const preferThreatFraming = directorDecision?.preferThreatFraming ?? false;
  const allowCut = directorDecision?.allowCut ?? true;
  const forceHold = directorDecision?.forceHold ?? false;
  const escalateCamera = directorDecision?.escalateCamera ?? false;

  const baseResult = {
    preserveFraming,
    preserveSubject,
    preserveActor,
    preserveFocus,
    focusHeld: preserveFocus,
  };

  if (!preserveSubject || !preserveActor) {
    if (allowCut) {
      return { type: "cut", ...baseResult };
    }
    return { type: "advance", ...baseResult };
  }

  if (forceHold) {
    return { type: "hold", ...baseResult };
  }

  if (preserveFraming && preserveFocus && !escalateCamera) {
    return { type: "hold", ...baseResult };
  }

  if (preserveFraming && preserveFocus && escalateCamera) {
    return { type: "advance", ...baseResult };
  }

  if (preserveFraming && !preserveFocus) {
    return { type: "advance", ...baseResult };
  }

  if (allowCut) {
    return { type: "cut", ...baseResult };
  }

  return { type: "advance", ...baseResult };
}
