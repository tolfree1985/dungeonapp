import type { SceneMotif } from "@/lib/resolveSceneMotif";
import type { SceneShotIntent } from "@/lib/sceneTypes";
import type { SceneFocusState } from "@/lib/resolveSceneFocusState";
import type { SceneTransition } from "@/lib/resolveSceneTransition";

export type SceneRevealStage = "hint" | "partial" | "full" | "aftermath";
export type SceneRevealFocus = "environment" | "detail" | "threat" | "actor";
export type SceneRevealClarity = "clear" | "fuzzy" | "obscured";

export type SceneRevealStructure = {
  revealStage: SceneRevealStage;
  revealFocus: SceneRevealFocus;
  revealClarity: SceneRevealClarity;
};

type ResolveSceneRevealStructureArgs = {
  shotIntent: SceneShotIntent;
  focusState: SceneFocusState;
  motif: SceneMotif | null;
  sceneTransition: SceneTransition | null;
};

export function resolveSceneRevealStructure({
  shotIntent,
  focusState,
  motif,
  sceneTransition,
}: ResolveSceneRevealStructureArgs): SceneRevealStructure {
  const revealStage: SceneRevealStage = (() => {
    if (shotIntent === "reveal") return sceneTransition?.type === "cut" ? "aftermath" : "full";
    if (shotIntent === "inspect") return "partial";
    if (shotIntent === "threaten") return "aftermath";
    return "hint";
  })();

  const focusType = focusState.focusType;
  const revealFocus: SceneRevealFocus = focusType === "detail"
    ? "detail"
    : focusType === "threat"
    ? "threat"
    : focusType === "actor"
    ? "actor"
    : "environment";

  const clarity: SceneRevealClarity = motif?.atmosphere === "clear"
    ? "clear"
    : motif?.atmosphere === "foggy" || motif?.atmosphere === "smoky"
    ? "obscured"
    : "fuzzy";

  return {
    revealStage,
    revealFocus,
    revealClarity: clarity,
  };
}

export function buildRevealStructureTags(structure: SceneRevealStructure | null): string[] {
  if (!structure) return [];
  const mapping: Record<SceneRevealStage, string> = {
    hint: "reveal-hint",
    partial: "reveal-partial",
    full: "reveal-full",
    aftermath: "reveal-aftermath",
  };
  return [mapping[structure.revealStage]];
}
