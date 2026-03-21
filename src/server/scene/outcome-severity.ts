export type OutcomeSeverity = "normal" | "strained" | "harsh";

export function resolveOutcomeSeverity(params: { forcedComplicationCount: number }): OutcomeSeverity {
  if (params.forcedComplicationCount >= 2) {
    return "harsh";
  }
  if (params.forcedComplicationCount === 1) {
    return "strained";
  }
  return "normal";
}
