import type { FinalizedComplication } from "@/server/scene/complication-selection";

export type ConsequenceKind = "primary" | "complication" | "cost";

export type ConsequenceEntry = {
  id: string;
  kind: ConsequenceKind;
  ledgerText: string;
  narrationText?: string;
};

export type ConsequenceBundle = {
  complicationEntries: ConsequenceEntry[];
  extraCostEntries: ConsequenceEntry[];
};

const FALLBACK_COMPLICATIONS: FinalizedComplication[] = [
  "complication-applied",
  "noise.escalation",
  "npc.suspicion",
  "position.penalty",
  "time.scene-prolonged",
];
const CONSEQUENCE_TEXT: Record<FinalizedComplication, string> = {
  "complication-applied": "Complication applied",
  "noise.escalation": "Noise escalates",
  "npc.suspicion": "NPC suspicion rises",
  "position.penalty": "Position weakens",
  "time.scene-prolonged": "Scene timing stretches",
};

export function buildConsequenceBundle(params: {
  forcedComplicationCount: number;
  outcomeSeverity: "normal" | "strained" | "harsh";
  consequenceBudgetExtraCostCount: number;
}): ConsequenceBundle {
  const { forcedComplicationCount, consequenceBudgetExtraCostCount } = params;
  const complicationEntries: ConsequenceEntry[] = [];
  let fallbackIndex = 0;
  while (complicationEntries.length < forcedComplicationCount) {
    const complication = FALLBACK_COMPLICATIONS[fallbackIndex % FALLBACK_COMPLICATIONS.length];
    complicationEntries.push({
      id: complication,
      kind: "complication",
      ledgerText: CONSEQUENCE_TEXT[complication],
    });
    fallbackIndex += 1;
  }
  const extraCostEntries = Array.from({ length: consequenceBudgetExtraCostCount }, (_, index) => ({
    id: `extra-cost-${index + 1}`,
    kind: "cost",
    ledgerText: `Extra cost ${index + 1}`,
  }));
  return { complicationEntries, extraCostEntries };
}
