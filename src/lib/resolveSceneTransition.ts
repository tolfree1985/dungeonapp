import type { SceneVisualState } from "@/lib/resolveSceneVisualState";
import type { SceneFramingState } from "@/lib/resolveSceneFramingState";
import type { SceneSubjectState } from "@/lib/resolveSceneSubjectState";
import type { SceneActorState } from "@/lib/resolveSceneActorState";

export type SceneComposition = {
  visual: SceneVisualState;
  framing: SceneFramingState;
  subject: SceneSubjectState;
  actor: SceneActorState;
};

type SceneTransitionType = "hold" | "advance" | "cut";

export type SceneTransition = {
  type: SceneTransitionType;
  preserveFraming: boolean;
  preserveSubject: boolean;
  preserveActor: boolean;
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
}): SceneTransition {
  const { previous, next } = args;
  if (!previous) {
    return { type: "cut", preserveFraming: false, preserveSubject: false, preserveActor: false };
  }

  const sameSubject = equalsSubject(previous.subject, next.subject);
  const sameActor = equalsActor(previous.actor, next.actor);
  const sameVisual = equalsVisual(previous.visual, next.visual);
  const sameFraming = equalsFraming(previous.framing, next.framing);

  if (!sameSubject || !sameActor) {
    return { type: "cut", preserveFraming: false, preserveSubject: false, preserveActor: false };
  }

  if (sameVisual && sameFraming) {
    return { type: "hold", preserveFraming: true, preserveSubject: true, preserveActor: true };
  }

  return {
    type: "advance",
    preserveFraming: sameFraming,
    preserveSubject: true,
    preserveActor: true,
  };
}
