import { describe, expect, it } from "vitest";
import { WORLD_FLAGS } from "@/lib/engine/worldFlags";
import { evaluateOpportunityRules } from "@/server/turn/opportunityRules";

describe("opportunity rules", () => {
  it("narrows opportunity when finalized effects include the window-narrowed summary", () => {
    const result = evaluateOpportunityRules({
      intentMode: "DO",
      normalizedInput: "move forward",
      sceneText: "A plain corridor",
      effectSummaries: ["objective.window-narrowed"],
      sceneClock: 2,
    });

    expect(result.opportunityWindowState).toEqual({
      windowNarrowed: true,
      opportunityTier: "reduced",
    });
    expect(result.matchedRules.map((rule) => rule.id)).toContain(
      "OPPORTUNITY_WINDOW_REDUCED_BY_FINALIZED_EFFECTS",
    );
  });

  it("restores a normal opportunity window in deep shadows while hiding", () => {
    const result = evaluateOpportunityRules({
      intentMode: "DO",
      normalizedInput: "hide in the shadows",
      sceneText: "Deep shadows cover the room",
      effectSummaries: ["objective.window-narrowed"],
      sceneClock: 2,
    });

    expect(result.opportunityWindowState).toEqual({
      windowNarrowed: false,
      opportunityTier: "normal",
    });
    expect(result.matchedRules.map((rule) => rule.id)).toContain("SHADOW_HIDE_OPPORTUNITY");
  });

  it("creates a concealment opportunity from hidden state even without shadow text", () => {
    const result = evaluateOpportunityRules({
      intentMode: "DO",
      normalizedInput: "hide in cover",
      sceneText: "A plain corridor",
      effectSummaries: [],
      stateFlags: {
        [WORLD_FLAGS.status.hidden]: true,
      },
      sceneClock: 2,
    });

    expect(result.opportunityTruth).not.toBeNull();
    expect(result.matchedRules.map((rule) => rule.id)).toContain(
      "HIDDEN_STATE_CONCEALMENT_OPPORTUNITY",
    );
    expect(result.ledgerAdds).toContainEqual(
      expect.objectContaining({
        kind: "opportunity.window-state",
        cause: "status.hidden",
        effect: "concealment improved",
      }),
    );
  });

  it("does not create a concealment opportunity when exposed or revealed", () => {
    const result = evaluateOpportunityRules({
      intentMode: "DO",
      normalizedInput: "hide in cover",
      sceneText: "A plain corridor",
      effectSummaries: [],
      stateFlags: {
        [WORLD_FLAGS.status.hidden]: true,
        [WORLD_FLAGS.status.exposed]: true,
        [WORLD_FLAGS.player.revealed]: true,
        [WORLD_FLAGS.guard.searching]: true,
      },
      sceneClock: 2,
    });

    expect(result.opportunityTruth).toBeNull();
    expect(result.matchedRules).toHaveLength(0);
    expect(result.ledgerAdds).toHaveLength(0);
  });

  it("creates a baseline hide opportunity in a plain room", () => {
    const result = evaluateOpportunityRules({
      intentMode: "DO",
      normalizedInput: "hide in cover",
      sceneText: "A plain corridor",
      effectSummaries: [],
      sceneClock: 2,
    });

    expect(result.opportunityTruth).not.toBeNull();
    expect(result.opportunityTruth?.rulesTriggered.map((rule) => rule.ruleId)).toContain(
      "HIDE_BASELINE_OPPORTUNITY",
    );
    expect(result.opportunityWindowState).toEqual({
      windowNarrowed: false,
      opportunityTier: "normal",
    });
    expect(result.ledgerAdds).toContainEqual(
      expect.objectContaining({
        kind: "opportunity.window-state",
        cause: "hide.action",
        effect: "concealment improved",
      }),
    );
  });
});
