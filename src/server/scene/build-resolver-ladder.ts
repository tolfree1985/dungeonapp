import type { ActionConstraints } from "@/lib/action-constraints";
import { combineActionConstraints } from "@/lib/action-constraints";
import type { NoiseActionFlags } from "@/lib/noise-action-flags";
import type { PositionActionFlags } from "@/lib/position-action-flags";
import type { WatchfulnessActionFlags } from "@/lib/watchfulness-action-flags";
import { resolveActionConstraintPressure } from "@/server/scene/action-constraint-pressure";
import { resolveActionRisk } from "@/server/scene/action-risk";
import { resolveComplicationWeight } from "@/server/scene/complication-weight";
import { resolveComplicationTier } from "@/server/scene/complication-tier";
import { resolveComplicationSelectionPolicy } from "@/server/scene/complication-selection-policy";
import { resolveOutcomeSeverity } from "@/server/scene/outcome-severity";
import { resolveConsequenceBudget } from "@/server/scene/consequence-budget";
import { buildConsequenceBundle } from "@/server/scene/consequence-bundle";

export type ResolverLadderResult = {
  watchfulnessActionFlags: WatchfulnessActionFlags;
  positionActionFlags: PositionActionFlags;
  noiseActionFlags: NoiseActionFlags;
  actionConstraints: ActionConstraints;
  constraintPressure: number;
  constraintPressureActive: string[];
  actionRisk: ReturnType<typeof resolveActionRisk>;
  complicationWeight: ReturnType<typeof resolveComplicationWeight>;
  complicationTier: ReturnType<typeof resolveComplicationTier>;
  forcedComplicationCount: number;
  outcomeSeverity: "normal" | "strained" | "harsh";
  consequenceBudgetExtraCostCount: number;
  consequenceBundle: ReturnType<typeof buildConsequenceBundle>;
};

export function buildResolverLadder(params: {
  watchfulnessActionFlags: WatchfulnessActionFlags;
  positionActionFlags: PositionActionFlags;
  noiseActionFlags: NoiseActionFlags;
}): ResolverLadderResult {
  const actionConstraints = combineActionConstraints({
    watchfulness: params.watchfulnessActionFlags,
    position: params.positionActionFlags,
    noise: params.noiseActionFlags,
  });
  const actionConstraintPressure = resolveActionConstraintPressure(actionConstraints);
  const actionRisk = resolveActionRisk(actionConstraintPressure);
  const complicationWeight = resolveComplicationWeight({ actionRiskDelta: actionRisk.actionRiskDelta });
  const complicationTier = resolveComplicationTier(complicationWeight);
  const selectionPolicy = resolveComplicationSelectionPolicy(complicationTier);
  const outcomeSeverity = resolveOutcomeSeverity({
    forcedComplicationCount: selectionPolicy.forcedComplicationCount,
  });
  const consequenceBudget = resolveConsequenceBudget({ outcomeSeverity });
  const consequenceBundle = buildConsequenceBundle({
    forcedComplicationCount: selectionPolicy.forcedComplicationCount,
    outcomeSeverity,
    consequenceBudgetExtraCostCount: consequenceBudget.extraCostCount,
  });
  return {
    watchfulnessActionFlags: params.watchfulnessActionFlags,
    positionActionFlags: params.positionActionFlags,
    noiseActionFlags: params.noiseActionFlags,
    actionConstraints,
    constraintPressure: actionConstraintPressure.constraintPressure,
    constraintPressureActive: actionConstraintPressure.activeConstraints,
    actionRisk,
    complicationWeight,
    complicationTier,
    forcedComplicationCount: selectionPolicy.forcedComplicationCount,
    outcomeSeverity,
    consequenceBudgetExtraCostCount: consequenceBudget.extraCostCount,
    consequenceBundle,
  };
}
