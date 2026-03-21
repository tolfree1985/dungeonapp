import type { FailForwardComplication } from "@/lib/fail-forward-complication";

export type FinalizedComplication =
  | FailForwardComplication
  | "complication-applied"
  | "noise.escalation"
  | "npc.suspicion"
  | "position.penalty"
  | "time.scene-prolonged";

export function resolveFinalizedComplications(params: {
  minimumComplicationCount: number;
  failForwardComplication: FailForwardComplication | null;
}): FinalizedComplication[] {
  if (params.minimumComplicationCount <= 0) {
    return [];
  }
  if (params.failForwardComplication) {
    return [params.failForwardComplication];
  }
  return ["complication-applied"];
}
