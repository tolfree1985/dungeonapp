import type { SceneFramingState } from "@/lib/resolveSceneFramingState";
import type { SceneSubjectState } from "@/lib/resolveSceneSubjectState";
import type { SceneActorState } from "@/lib/resolveSceneActorState";
import type { SceneFocusState } from "@/lib/resolveSceneFocusState";
import { EMPTY_SCENE_TRANSITION_MEMORY, type SceneTransitionMemory } from "./sceneTypes";

type Input<TFraming, TSubject, TActor, TFocus> = {
  previousMemory?: SceneTransitionMemory | null;
  previous:
    | {
        framing: TFraming | null;
        subject: TSubject | null;
        actor: TActor | null;
        focus: TFocus | null;
      }
    | null;
  current: {
    framing: TFraming;
    subject: TSubject;
    actor: TActor;
    focus: TFocus;
  };
};

function stableEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function resolveSceneTransitionMemory<
  TFraming,
  TSubject,
  TActor,
  TFocus,
>({
  previousMemory,
  previous,
  current,
}: Input<TFraming, TSubject, TActor, TFocus>): SceneTransitionMemory {
  const prior = previousMemory ?? EMPTY_SCENE_TRANSITION_MEMORY;

  if (!previous) {
    return EMPTY_SCENE_TRANSITION_MEMORY;
  }

  const sameFraming = stableEqual(previous.framing, current.framing);
  const sameSubject = stableEqual(previous.subject, current.subject);
  const sameActor = stableEqual(previous.actor, current.actor);
  const sameFocus = stableEqual(previous.focus, current.focus);

  return {
    preserveFraming: sameFraming || (prior.preserveFraming && sameSubject),
    preserveSubject: sameSubject || (prior.preserveSubject && sameFraming),
    preserveActor: sameActor || (prior.preserveActor && sameSubject),
    preserveFocus: sameFocus || (prior.preserveFocus && sameFraming),
  };
}
