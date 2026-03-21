import type { FinalizedComplication } from "@/lib/finalized-effects";

export type EnforceComplicationPolicyParams = {
  finalizedComplications: FinalizedComplication[];
  forcedComplicationCount: number;
};

export type EnforceComplicationPolicyResult = {
  finalizedComplications: FinalizedComplication[];
  policyApplied: boolean;
};

const FALLBACK_COMPLICATIONS: FinalizedComplication[] = [
  "complication-applied",
  "noise.escalation",
  "npc.suspicion",
  "position.penalty",
  "time.scene-prolonged",
];

export function enforceComplicationPolicy(
  params: EnforceComplicationPolicyParams,
): EnforceComplicationPolicyResult {
  if (params.forcedComplicationCount <= params.finalizedComplications.length) {
    return { finalizedComplications: params.finalizedComplications, policyApplied: false };
  }
  const needed = params.forcedComplicationCount - params.finalizedComplications.length;
  const additions: FinalizedComplication[] = [];
  const uniqueFallbacks = FALLBACK_COMPLICATIONS.filter((fallback) =>
    !params.finalizedComplications.includes(fallback),
  );
  for (const fallback of uniqueFallbacks) {
    if (additions.length >= needed) break;
    additions.push(fallback);
  }
  let fallbackIndex = 0;
  while (additions.length < needed) {
    additions.push(FALLBACK_COMPLICATIONS[fallbackIndex % FALLBACK_COMPLICATIONS.length]);
    fallbackIndex += 1;
  }
  return {
    finalizedComplications: [...params.finalizedComplications, ...additions],
    policyApplied: additions.length > 0,
  };
}
