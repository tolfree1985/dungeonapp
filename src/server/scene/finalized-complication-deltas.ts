import type { FinalizedComplication } from "@/server/scene/complication-selection";

export type FinalizedComplicationDeltas = {
  noise?: number;
  npcSuspicion?: number;
  positionPenalty?: number;
  timeAdvance?: number;
};

const COMPPLICATION_TO_DELTAS: Record<Exclude<FinalizedComplication, "complication-applied">, FinalizedComplicationDeltas> = {
  "noise-increased": { noise: 1 },
  "npc-suspicious": { npcSuspicion: 1 },
  "position-worsened": { positionPenalty: 1 },
  "time-lost": { timeAdvance: 1 },
  "complication-applied": {},
};

export function resolveFinalizedComplicationDeltas(complications: FinalizedComplication[]): FinalizedComplicationDeltas {
  return complications.reduce<FinalizedComplicationDeltas>((acc, complication) => {
    if (complication === "complication-applied") {
      return acc;
    }
    const delta = COMPPLICATION_TO_DELTAS[complication];
    if (!delta) return acc;
    return {
      noise: (acc.noise ?? 0) + (delta.noise ?? 0),
      npcSuspicion: (acc.npcSuspicion ?? 0) + (delta.npcSuspicion ?? 0),
      positionPenalty: (acc.positionPenalty ?? 0) + (delta.positionPenalty ?? 0),
      timeAdvance: (acc.timeAdvance ?? 0) + (delta.timeAdvance ?? 0),
    };
  }, {});
}
