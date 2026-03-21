import type { SceneDirectorBehavior } from "@/lib/resolveSceneDirectorBehavior";
import type { SceneFocusState } from "@/lib/resolveSceneFocusState";
import type { SceneMotif } from "@/lib/resolveSceneMotif";
import type { SceneShotGrammar } from "@/lib/resolveSceneShotGrammar";
import type { SceneShotIntent } from "@/lib/sceneTypes";
import type { SceneTransition } from "@/lib/resolveSceneTransition";
import type { SceneTransitionMemory } from "@/lib/sceneTypes";

export type SceneThreatLevel = "none" | "present" | "dominant";
export type SceneConfrontationBias = "low" | "medium" | "high";
export type SceneSubjectDominance = "balanced" | "threat-favored" | "player-favored";

export type SceneThreatFraming = {
  threatLevel: SceneThreatLevel;
  confrontationBias: SceneConfrontationBias;
  subjectDominance: SceneSubjectDominance;
};

type ResolveSceneThreatFramingArgs = {
  shotIntent: SceneShotIntent;
  shotGrammar: SceneShotGrammar;
  motif: SceneMotif | null;
  directorDecision: SceneDirectorBehavior | null;
  pressureStage?: string | null;
  focusState: SceneFocusState;
  sceneTransition: SceneTransition | null;
  transitionMemory: SceneTransitionMemory;
};

const normalizePressure = (stage?: string | null) => (stage ?? "calm").toLowerCase();

const highPressure = (stage?: string | null) => normalizePressure(stage) === "danger" || normalizePressure(stage) === "crisis";

const playerFocusTypes = new Set(["environment", "detail", "path"] as const);

export function resolveSceneThreatFraming(args: ResolveSceneThreatFramingArgs): SceneThreatFraming {
  const isThreatIntent = args.shotIntent === "threaten";
  const motifOminous = args.motif?.tone === "ominous";
  const motifHarsh = args.motif?.lighting === "harsh";
  const focusThreat = args.focusState.focusType === "threat";
  const focusPlayer = playerFocusTypes.has(args.focusState.focusType as SceneFocusState["focusType"]);
  const pressureDanger = highPressure(args.pressureStage) || highPressure(args.motif?.tone ?? "calm");
  const transitionInMotion = args.sceneTransition?.type !== "hold";

  const threatLevel: SceneThreatLevel = isThreatIntent && (motifOminous || motifHarsh)
    ? "dominant"
    : isThreatIntent || focusThreat || pressureDanger || args.shotIntent === "inspect"
    ? "present"
    : "none";

  const confrontationBias: SceneConfrontationBias = args.shotGrammar.emphasis === "threat" || args.directorDecision?.allowCut
    ? "high"
    : args.shotIntent === "inspect" || transitionInMotion || args.sceneTransition?.preserveFocus === false || args.transitionMemory.preserveFocus === false
    ? "medium"
    : "low";

  const subjectDominance: SceneSubjectDominance = focusThreat
    ? "threat-favored"
    : focusPlayer
    ? "player-favored"
    : "balanced";

  return { threatLevel, confrontationBias, subjectDominance };
}

export function buildThreatFramingTags(frames: SceneThreatFraming | null): string[] {
  if (!frames) return [];
  const mapping: Record<SceneThreatLevel, string[]> = {
    none: [],
    present: ["threat present"],
    dominant: ["dominant threat"],
  };
  return mapping[frames.threatLevel] ?? [];
}
