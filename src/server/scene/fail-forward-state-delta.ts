import type { FailForwardComplication } from "@/lib/fail-forward-complication";

export type FailForwardStateDelta = {
  noise?: number;
  positionPenalty?: number;
  timeAdvance?: number;
  npcSuspicion?: number;
};

export function resolveFailForwardStateDelta(
  complication: FailForwardComplication
): FailForwardStateDelta | null {
  switch (complication) {
    case "noise-increased":
      return { noise: 1 };
    case "position-worsened":
      return { positionPenalty: 1 };
    case "time-lost":
      return { timeAdvance: 1 };
    case "npc-suspicious":
      return { npcSuspicion: 1 };
    default:
      return null;
  }
}
