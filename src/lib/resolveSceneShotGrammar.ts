import type { SceneActorState } from "@/lib/resolveSceneActorState";
import type { SceneFramingState } from "@/lib/resolveSceneFramingState";
import type { SceneFocusState } from "@/lib/resolveSceneFocusState";
import type { SceneSubjectState } from "@/lib/resolveSceneSubjectState";
import type { SceneDirectorDecision } from "@/lib/resolveSceneDirectorDecision";
import type { SceneTransition } from "@/lib/resolveSceneTransition";
import type { SceneShotIntent } from "@/lib/resolveSceneShotIntent";

export type SceneShotGrammar = {
  emphasis: "environment" | "subject" | "threat" | "detail";
  compositionBias: "balanced" | "singular" | "confrontational";
  revealLevel: "low" | "medium" | "high";
};

type ResolveSceneShotGrammarArgs = {
  shotIntent: SceneShotIntent;
  directorDecision: SceneDirectorDecision | null;
  framingState: SceneFramingState;
  focusState: SceneFocusState;
  subjectState: SceneSubjectState;
  actorState: SceneActorState;
  sceneTransition: SceneTransition | null;
};

export function resolveSceneShotGrammar(args: ResolveSceneShotGrammarArgs): SceneShotGrammar {
  const { shotIntent, actorState, sceneTransition, directorDecision } = args;

  if (shotIntent === "threaten") {
    return { emphasis: "threat", compositionBias: "confrontational", revealLevel: "medium" };
  }

  if (shotIntent === "isolate") {
    return { emphasis: "subject", compositionBias: "singular", revealLevel: "low" };
  }

  if (shotIntent === "inspect") {
    return { emphasis: "detail", compositionBias: "singular", revealLevel: "low" };
  }

  if (shotIntent === "reveal") {
    return { emphasis: "environment", compositionBias: "balanced", revealLevel: "high" };
  }

  const actorVisible = actorState.actorVisible && actorState.primaryActorLabel;
  const prefersThreat = directorDecision?.preferThreatFraming && actorVisible;
  if (prefersThreat) {
    return { emphasis: "threat", compositionBias: "confrontational", revealLevel: "medium" };
  }

  return { emphasis: "environment", compositionBias: "balanced", revealLevel: "low" };
}
