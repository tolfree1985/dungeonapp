import { describe, expect, it } from "vitest";
import { resolveNoiseActionFlags } from "@/lib/noise-action-flags";
import { resolvePositionActionFlags } from "@/lib/position-action-flags";
import { resolveWatchfulnessActionFlags } from "@/lib/watchfulness-action-flags";
import { buildResolverLadder } from "@/server/scene/build-resolver-ladder";

describe("buildResolverLadder", () => {
  it("returns the base ladder when no constraints are active", () => {
    const ladder = buildResolverLadder({
      watchfulnessActionFlags: resolveWatchfulnessActionFlags({ watchfulness: "normal", mode: "DO" }),
      positionActionFlags: resolvePositionActionFlags(0),
      noiseActionFlags: resolveNoiseActionFlags(0),
    });
    expect(ladder.actionConstraints).toEqual({
      stealthDisadvantage: false,
      deceptionDisadvantage: false,
      mobilityDisadvantage: false,
      coverLost: false,
      attentionDrawn: false,
      searchPressure: false,
    });
    expect(ladder.constraintPressure).toBe(0);
    expect(ladder.actionRisk.actionRiskDelta).toBe(0);
    expect(ladder.complicationTier.complicationTier).toBe("none");
    expect(ladder.forcedComplicationCount).toBe(0);
    expect(ladder.outcomeSeverity).toBe("normal");
    expect(ladder.consequenceBudgetExtraCostCount).toBe(0);
    expect(ladder.consequenceBundle.complicationEntries).toEqual([]);
    expect(ladder.consequenceBundle.extraCostEntries).toEqual([]);
  });

  it("escalates to harsh severity when multiple constraints stack", () => {
    const ladder = buildResolverLadder({
      watchfulnessActionFlags: resolveWatchfulnessActionFlags({ watchfulness: "high", mode: "DO" }),
      positionActionFlags: resolvePositionActionFlags(1),
      noiseActionFlags: resolveNoiseActionFlags(2),
    });
    expect(ladder.constraintPressure).toBe(3);
    expect(ladder.actionRisk.actionRiskDelta).toBe(2);
    expect(ladder.complicationWeight.complicationWeightDelta).toBe(2);
    expect(ladder.complicationTier.complicationTier).toBe("heavy");
    expect(ladder.forcedComplicationCount).toBe(2);
    expect(ladder.outcomeSeverity).toBe("harsh");
    expect(ladder.consequenceBudgetExtraCostCount).toBe(2);
    expect(ladder.consequenceBundle.complicationEntries).toHaveLength(2);
    expect(ladder.consequenceBundle.extraCostEntries).toHaveLength(2);
  });

  it("treats watchfulness.SAY as deception disadvantage and yields elevated risk", () => {
    const ladder = buildResolverLadder({
      watchfulnessActionFlags: resolveWatchfulnessActionFlags({ watchfulness: "elevated", mode: "SAY" }),
      positionActionFlags: resolvePositionActionFlags(0),
      noiseActionFlags: resolveNoiseActionFlags(0),
    });
    expect(ladder.constraintPressure).toBe(1);
    expect(ladder.actionRisk.actionRiskDelta).toBe(1);
    expect(ladder.complicationTier.complicationTier).toBe("light");
    expect(ladder.forcedComplicationCount).toBe(1);
    expect(ladder.outcomeSeverity).toBe("strained");
    expect(ladder.consequenceBudgetExtraCostCount).toBe(1);
    expect(ladder.consequenceBundle.extraCostEntries).toHaveLength(1);
    expect(ladder.consequenceBundle.complicationEntries).toHaveLength(1);
  });

  it("builds the expected complication bundle for stacked constraints", () => {
    const ladder = buildResolverLadder({
      watchfulnessActionFlags: resolveWatchfulnessActionFlags({ watchfulness: "high", mode: "DO" }),
      positionActionFlags: resolvePositionActionFlags(2),
      noiseActionFlags: resolveNoiseActionFlags(1),
    });
    expect(ladder.forcedComplicationCount).toBe(2);
    expect(ladder.consequenceBundle.complicationEntries).toEqual([
      "complication-applied",
      "noise.escalation",
    ]);
    expect(ladder.consequenceBundle.extraCostEntries).toEqual(["extra-cost-1", "extra-cost-2"]);
  });

  it("emits a single extra-cost entry when the budget requires it", () => {
    const ladder = buildResolverLadder({
      watchfulnessActionFlags: resolveWatchfulnessActionFlags({ watchfulness: "elevated", mode: "DO" }),
      positionActionFlags: resolvePositionActionFlags(0),
      noiseActionFlags: resolveNoiseActionFlags(1),
    });
    expect(ladder.consequenceBudgetExtraCostCount).toBe(1);
    expect(ladder.consequenceBundle.extraCostEntries).toEqual(["extra-cost-1"]);
  });
});
