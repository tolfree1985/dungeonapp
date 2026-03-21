import type { SceneDirectorDecision } from "@/lib/resolveSceneDirectorDecision";
import type { SceneFocusState } from "@/lib/resolveSceneFocusState";
import type { SceneFramingState } from "@/lib/resolveSceneFramingState";
import type { SceneShotGrammar } from "@/lib/resolveSceneShotGrammar";
import type { SceneShotIntent } from "@/lib/sceneTypes";

export type ScenePromptFraming = {
  visualTags: string[];
  compositionNotes: string[];
};

type ResolveScenePromptFramingArgs = {
  shotIntent: SceneShotIntent;
  shotGrammar: SceneShotGrammar;
  directorDecision: SceneDirectorDecision | null;
  framingState: SceneFramingState;
  focusState: SceneFocusState;
};

export const intentVisualTagMap: Record<SceneShotIntent, readonly string[]> = {
  observe: ["observe-gaze", "survey-context"],
  inspect: ["inspect-detail", "focused-curiosity"],
  threaten: ["threaten-urgency", "danger-front"],
  reveal: ["reveal-context", "uncovering-scene"],
  isolate: ["isolate-subject", "pinpoint-focus"],
};

export const intentCompositionNoteMap: Record<SceneShotIntent, readonly string[]> = {
  observe: ["peripheral-awareness"],
  inspect: ["careful-examination"],
  threaten: ["high-tension"],
  reveal: ["world-reveal"],
  isolate: ["concentrated-focus"],
};

export const emphasisTagMap: Record<SceneShotGrammar["emphasis"], readonly string[]> = {
  threat: ["emphasis-threat", "signal-danger", "oppositional-staging"],
  subject: ["emphasis-subject", "singular-focus"],
  detail: ["emphasis-detail", "close-examination"],
  environment: ["emphasis-environment", "wide-context"],
};

export const compositionBiasNotesMap: Record<SceneShotGrammar["compositionBias"], readonly string[]> = {
  confrontational: ["confrontational", "opposing-forces"],
  singular: ["single-subject", "compressed-attention"],
  balanced: ["balanced-composition"],
};

export const revealTagMap: Record<SceneShotGrammar["revealLevel"], string> = {
  low: "reveal-low",
  medium: "reveal-medium",
  high: "reveal-high",
};

export function resolveScenePromptFraming(args: ResolveScenePromptFramingArgs): ScenePromptFraming {
  const { shotIntent, shotGrammar } = args;
  const tags: string[] = [`intent-${shotIntent}`];
  tags.push(...intentVisualTagMap[shotIntent]);
  tags.push(...emphasisTagMap[shotGrammar.emphasis]);
  const revealTag = revealTagMap[shotGrammar.revealLevel];
  if (revealTag) {
    tags.push(revealTag);
  }

  const notes: string[] = [];
  notes.push(...intentCompositionNoteMap[shotIntent]);
  notes.push(...compositionBiasNotesMap[shotGrammar.compositionBias]);

  return { visualTags: tags, compositionNotes: notes };
}
