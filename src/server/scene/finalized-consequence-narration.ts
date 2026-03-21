type FinalizedConsequenceNarrationLine = string;

export type FinalizedConsequenceNarration = {
  headline: string;
  primaryLines: FinalizedConsequenceNarrationLine[];
  complicationLines: FinalizedConsequenceNarrationLine[];
  costLines: FinalizedConsequenceNarrationLine[];
};

const HEADLINES: Record<"normal" | "strained" | "harsh", string> = {
  normal: "The aftermath stays calm.",
  strained: "The situation tightens.",
  harsh: "The world reels under pressure.",
};

const COMPLICATION_LINES: Record<string, string> = {
  "complication-applied": "A complication settles into the scene.",
  "noise.escalation": "Noise rises, drawing attention.",
  "npc.suspicion": "NPC suspicion increases.",
  "position.penalty": "Your position weakens.",
  "time.scene-prolonged": "The scene stretches longer.",
  "time-lost": "Time slips away.",
  "npc-suspicious": "NPC suspicion increases.",
  "noise-increased": "Noise rises further.",
  "position-worsened": "Your stance collapses.",
  "time-scene-prolonged": "The scene drags on.",
};

const EXTRA_COST_LINES: Record<string, string> = {
  "extra-cost-1": "You pay an extra cost.",
  "extra-cost-2": "Costs mount rapidly.",
};

function lineForEntry(entry: { ledgerText: string; narrationText?: string }): string {
  if (entry.narrationText) return entry.narrationText;
  const normalizedId = entry.id ?? entry.ledgerText;
  if (COMPLICATION_LINES[normalizedId]) return COMPLICATION_LINES[normalizedId];
  if (EXTRA_COST_LINES[normalizedId]) return EXTRA_COST_LINES[normalizedId];
  return entry.ledgerText;
}

/**
 * Deterministic projection only.
 * Narration is fully derivable from the finalized consequence result and
 * must not inspect transient resolver plumbing or invent additional state.
 */
export function buildFinalizedConsequenceNarration(params: {
  outcomeSeverity: "normal" | "strained" | "harsh";
  consequenceComplicationEntries: { id: string; ledgerText: string; narrationText?: string }[];
  consequenceExtraCostEntries: { id: string; ledgerText: string; narrationText?: string }[];
}): FinalizedConsequenceNarration {
  const headline = HEADLINES[params.outcomeSeverity] ?? "The consequences land.";
  return {
    headline,
    primaryLines: [],
    complicationLines: params.consequenceComplicationEntries.map((entry) => lineForEntry(entry)),
    costLines: params.consequenceExtraCostEntries.map((entry) => lineForEntry(entry)),
  };
}

export function flattenNarrationLines(narration: FinalizedConsequenceNarration): string[] {
  return [
    ...narration.primaryLines,
    ...narration.complicationLines,
    ...narration.costLines,
  ];
}
