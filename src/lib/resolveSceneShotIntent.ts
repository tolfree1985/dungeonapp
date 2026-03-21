import type { SceneActorState } from "@/lib/resolveSceneActorState";
import type { SceneFocusState } from "@/lib/resolveSceneFocusState";
import type { SceneFramingState } from "@/lib/resolveSceneFramingState";
import type { SceneSubjectState } from "@/lib/resolveSceneSubjectState";
import type { SceneTransition } from "@/lib/resolveSceneTransition";
import type { SceneShotIntent, SceneTransitionMemory } from "@/lib/sceneTypes";

type ResolveSceneShotIntentArgs = {
  pressureStage?: string | null;
  focusState: SceneFocusState;
  subjectState: SceneSubjectState;
  actorState: SceneActorState;
  framingState: SceneFramingState;
  sceneTransition: SceneTransition | null;
  transitionMemory?: SceneTransitionMemory | null;
};

export function resolveSceneShotIntent(args: ResolveSceneShotIntentArgs): SceneShotIntent {
  const pressure = (args.pressureStage ?? args.focusState.focusType ?? "calm").toLowerCase();
  const highPressure = pressure === "danger" || pressure === "crisis";
  const threatFocus = args.subjectState.primarySubjectKind === "threat";
  const actorThreat = args.actorState.primaryActorRole?.toLowerCase().includes("threat");
  const closeActor = args.framingState.shotScale === "close" && args.actorState.actorVisible;
  const focusDetail = args.focusState.focusType === "detail" || args.focusState.focusType === "clue";
  const transitionMemory = args.transitionMemory ?? null;
  const isolatedFocus = closeActor && highPressure;

  if (highPressure && (threatFocus || actorThreat)) {
    return "threaten";
  }

  if (closeActor && actorThreat && highPressure) {
    return "isolate";
  }

  if (focusDetail && args.sceneTransition?.type !== "cut") {
    return "inspect";
  }

  if (isolatedFocus) {
    return "isolate";
  }

  if (args.sceneTransition?.type === "cut") {
    return "reveal";
  }

  return "observe";
}
