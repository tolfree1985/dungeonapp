import type { OutcomeSeverity } from "@/server/scene/outcome-severity";
import type { ConsequenceEntry } from "@/server/scene/consequence-bundle";

export type FinalizedConsequenceBundleInput = {
  forcedComplicationCount: number;
  outcomeSeverity: OutcomeSeverity;
  consequenceBudgetExtraCostCount: number;
  consequenceComplicationEntries: ConsequenceEntry[];
  consequenceExtraCostEntries: ConsequenceEntry[];
};

export type FinalizedConsequenceResult = FinalizedConsequenceBundleInput;

export function buildFinalizedConsequenceResult(
  input: FinalizedConsequenceBundleInput
): FinalizedConsequenceResult {
  if (input.consequenceComplicationEntries.length < input.forcedComplicationCount) {
    throw new Error("CONSEQUENCE_BUNDLE_COMPILATION_INVARIANT");
  }
  if (input.consequenceExtraCostEntries.length !== input.consequenceBudgetExtraCostCount) {
    throw new Error("CONSEQUENCE_BUNDLE_BUDGET_MISMATCH");
  }

  return { ...input };
}
