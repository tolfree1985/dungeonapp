import { describe, expect, it } from "vitest";
import { normalizeStatePanel } from "../normalizeStatePanel";

describe("normalizeStatePanel", () => {
  it("projects the same authoritative snapshot for SSR and client hydration", () => {
    const state = {
      stats: [
        { key: "noise", value: 3 },
        { key: "time", value: 2 },
        { key: "suspicion", value: 1 },
        { key: "danger", value: 4 },
      ],
      inventory: [{ name: "torch", detail: "A steady flame." }],
      quests: [{ title: "Find the exit", status: "active" }],
      relationships: [{ name: "Guard", status: "alerted" }],
      flags: { room_darkness: true },
      opportunityWindow: {
        type: "shadow_hide",
        source: "environment.shadow",
        createdAtTurn: 3,
        consumableOnTurn: 4,
        expiresAtTurn: 4,
        expiresAt: 12,
        conditions: { ruleId: "SHADOW_HIDE_OPPORTUNITY" },
        status: "active",
        createdTurnIndex: 3,
      },
      opportunityCooldowns: {
        shadow_hide: {
          reason: "expired",
          atTurn: 4,
          expiresAtTurn: 5,
          blockingConditions: {
            "guard.searching": true,
            "status.exposed": true,
          },
        },
      },
      world: {
        clocks: {
          clk_noise: { value: 3 },
          clk_alert: { value: 4 },
        },
      },
      _meta: {
        scenarioDiagnostics: [
          {
            type: "overlap",
            ruleId: "MOVE_BLOCKED_GENERIC",
            relatedRuleId: "MOVE_BLOCKED_BY_COLLAPSED_PASSAGE",
            message: "Rule MOVE_BLOCKED_GENERIC overlaps with MOVE_BLOCKED_BY_COLLAPSED_PASSAGE. This rule will shadow another due to FIRST_MATCH ordering.",
            severity: "warning",
            suggestion: "Narrow the conditions or use 'replaces' to explicitly override the broader rule.",
          },
        ],
      },
    };

    const ssrPanel = normalizeStatePanel(state);
    const clientPanel = normalizeStatePanel(structuredClone(state));

    expect(clientPanel).toEqual(ssrPanel);
    expect(ssrPanel.opportunityWindow).toEqual(state.opportunityWindow);
    expect(ssrPanel.summary?.opportunities.map((line) => line.text)).toEqual(
      expect.arrayContaining([
        "Hidden Strike Opportunity",
        "You can strike from concealment this turn.",
        "Strong advantage",
        "Consumed on use",
        "Lost if you wait",
      ]),
    );
    expect(ssrPanel.pressure).toEqual({
      noise: 3,
      danger: 4,
      suspicion: 1,
      time: 2,
    });
  });
});
