// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  buildAdventureHistoryRowViewModel,
  buildStatePanelViewModel,
  classifyTruthKind,
  isAligned,
  rankOpportunities,
} from "@/components/play/presenters";
import type { MechanicFacts } from "@/lib/engine/presentation/mechanicFacts";
import type { TurnResolutionPresentation } from "@/server/scene/turn-resolution-presentation";

function emptyMechanicFacts(): MechanicFacts {
  return {
    achieved: [],
    costs: [],
    turnChanges: [],
    persistent: [],
    careNow: [],
    world: [],
    opportunities: [],
  };
}

describe("buildStatePanelViewModel blocked inspection", () => {
  it("mirrors the finalized resolution values in dev inspection", () => {
    const resolution: TurnResolutionPresentation = {
      outcome: "SUCCESS_WITH_COST",
      rollLabel: "Roll 8 • 2d6",
      resultLabel: "SUCCESS WITH COST",
    };
    const viewModel = buildStatePanelViewModel(
      {
        stats: [],
        inventory: [],
        quests: [],
        relationships: [],
        summary: emptyMechanicFacts(),
      },
      [],
      emptyMechanicFacts(),
      {
        resolution,
      },
    );

    expect(viewModel.devInspection.resolutionOutcome).toBe("SUCCESS_WITH_COST");
    expect(viewModel.devInspection.resolutionLabel).toBe("SUCCESS WITH COST");
    expect(viewModel.devInspection.resolutionRollLabel).toBe("Roll 8 • 2d6");
  });

  it("surfaces blocked truth in dev inspection", () => {
    const viewModel = buildStatePanelViewModel(
      {
        stats: [],
        inventory: [],
        quests: [],
        relationships: [],
        summary: emptyMechanicFacts(),
      },
      [],
      emptyMechanicFacts(),
      {
        blockedTruth: {
          ruleId: "READ_BLOCKED_BY_DARKNESS",
          blockedAction: "look",
          matchedConditions: [{ type: "flag", key: "room_darkness", equals: true }],
          cause: "room.darkness",
          effect: "reading prevented",
        },
      },
    );

    expect(viewModel.devInspection.blocked?.ruleId).toBe("READ_BLOCKED_BY_DARKNESS");
    expect(viewModel.devInspection.blocked?.matchedConditions).toContainEqual({
      type: "flag",
      key: "room_darkness",
      equals: true,
    });
    expect(viewModel.devInspection.blocked?.cause).toBe("room.darkness");
    expect(viewModel.devInspection.blocked?.effect).toBe("reading prevented");
  });

  it("surfaces pressure truth in dev inspection", () => {
    const viewModel = buildStatePanelViewModel(
      {
        stats: [],
        inventory: [],
        quests: [],
        relationships: [],
        summary: emptyMechanicFacts(),
      },
      [],
      emptyMechanicFacts(),
      {
        pressureTruth: {
          rulesTriggered: [
            {
              ruleId: "WAIT_ADVANCES_INVESTIGATION",
              matchedConditions: [{ type: "statAtLeast", key: "alert", value: 1 }],
              effects: [{ type: "clock.inc", id: "clk_alert", by: 1 }],
            },
          ],
        },
      },
    );

    expect(viewModel.devInspection.pressure?.rulesTriggered[0].ruleId).toBe("WAIT_ADVANCES_INVESTIGATION");
    expect(viewModel.devInspection.pressure?.rulesTriggered[0].matchedConditions).toContainEqual({
      type: "statAtLeast",
      key: "alert",
      value: 1,
    });
  });

  it("surfaces opportunity truth in dev inspection", () => {
    const viewModel = buildStatePanelViewModel(
      {
        stats: [],
        inventory: [],
        quests: [],
        relationships: [],
        opportunityWindow: {
          type: "shadow_hide",
          source: "environment.shadow",
          createdAtTurn: 3,
          consumableOnTurn: 4,
          expiresAtTurn: 4,
          expiresAt: 12,
          conditions: {
            ruleId: "SHADOW_HIDE_OPPORTUNITY",
          },
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
        summary: emptyMechanicFacts(),
      },
      [],
      emptyMechanicFacts(),
      {
        opportunityTruth: {
          quality: "clean",
          rulesTriggered: [
            {
              ruleId: "SHADOW_HIDE_OPPORTUNITY",
              matchedConditions: [{ type: "intentMode", mode: "DO" }],
              effects: [{ type: "window.set", windowNarrowed: false, opportunityTier: "normal", detail: "Deep shadows make concealment easier." }],
            },
          ],
          benefit: {
            kind: "reduced_cost",
            source: "hidden_window",
            quality: "clean",
            prevented: ["noise increase", "alert increase"],
            detail: "Hidden position lets the strike land without drawing the room's full attention.",
          },
        },
      },
    );

    expect(viewModel.devInspection.opportunity?.rulesTriggered[0].ruleId).toBe("SHADOW_HIDE_OPPORTUNITY");
    expect(viewModel.devInspection.opportunity?.rulesTriggered[0].matchedConditions).toContainEqual({
      type: "intentMode",
      mode: "DO",
    });
    expect(viewModel.devInspection.opportunity?.quality).toBe("clean");
    expect(viewModel.devInspection.opportunity?.benefit).toEqual(
      expect.objectContaining({
        kind: "reduced_cost",
        source: "hidden_window",
        quality: "clean",
        prevented: expect.arrayContaining(["noise increase"]),
      }),
    );
    expect(viewModel.opportunityWindow?.type).toBe("shadow_hide");
    expect(viewModel.devInspection.opportunityWindow?.source).toBe("environment.shadow");
    expect(viewModel.devInspection.opportunityCooldowns).toEqual({
      shadow_hide: {
        reason: "expired",
        atTurn: 4,
        expiresAtTurn: 5,
        blockingConditions: {
          "guard.searching": true,
          "status.exposed": true,
        },
      },
    });
  });

  it("surfaces scenario diagnostics in dev inspection", () => {
    const viewModel = buildStatePanelViewModel(
      {
        stats: [],
        inventory: [],
        quests: [],
        relationships: [],
        summary: emptyMechanicFacts(),
      },
      [],
      emptyMechanicFacts(),
      {
        scenarioDiagnostics: [
          {
            type: "overlap",
            ruleId: "MOVE_BLOCKED_GENERIC",
            relatedRuleId: "MOVE_BLOCKED_BY_COLLAPSED_PASSAGE",
            message: "This rule will shadow a more specific rule due to FIRST_MATCH ordering.",
            severity: "warning",
            suggestion: "Narrow the conditions or use 'replaces' to explicitly override the broader rule.",
          },
        ],
      },
    );

    expect(viewModel.devInspection.scenarioDiagnostics).toHaveLength(1);
    expect(viewModel.devInspection.scenarioDiagnostics[0].ruleId).toBe("MOVE_BLOCKED_GENERIC");
    expect(viewModel.devInspection.scenarioDiagnostics[0].relatedRuleId).toBe("MOVE_BLOCKED_BY_COLLAPSED_PASSAGE");
  });
});

describe("buildStatePanelViewModel pressure language", () => {
  it("normalizes pressure warnings deterministically", () => {
    const viewModel = buildStatePanelViewModel(
      {
        stats: [],
        inventory: [],
        quests: [],
        relationships: [],
        summary: emptyMechanicFacts(),
      },
      [],
      emptyMechanicFacts(),
      {},
    );

    expect(viewModel.pressureWarnings.danger).toBe("stable");
    expect(viewModel.pressureWarnings.noise).toBe("quiet");
    expect(viewModel.pressureWarnings.suspicion).toBe("low");
    expect(viewModel.pressureWarnings.time).toBe("stable");
  });
});

describe("buildAdventureHistoryRowViewModel truth priority", () => {
  it("classifies canonical truth precedence directly", () => {
    expect(classifyTruthKind({ blockedTruth: { ruleId: "BLOCKED" } })).toBe("BLOCKED");
    expect(
      classifyTruthKind({
        pressureTruth: {
          rulesTriggered: [{ ruleId: "PRESSURE", matchedConditions: [], effects: [] }],
        },
      })
    ).toBe("PRESSURE");
    expect(
      classifyTruthKind({
        opportunityTruth: {
          rulesTriggered: [{ ruleId: "OPPORTUNITY", matchedConditions: [], effects: [] }],
        },
      })
    ).toBe("OPPORTUNITY");
    expect(classifyTruthKind({})).toBe("NEUTRAL");
  });

  it("prefers pressure truth over missing resolution text", () => {
    const row = buildAdventureHistoryRowViewModel(
      {
        id: "turn-pressure",
        turnIndex: 3,
        playerInput: "WAIT: hold still",
        scene: "Hallway",
        resolution: "",
        stateDeltas: [],
        ledgerAdds: [],
        createdAt: new Date().toISOString(),
        pressureTruth: {
          rulesTriggered: [
            {
              ruleId: "WAIT_ADVANCES_INVESTIGATION",
              matchedConditions: [{ type: "statAtLeast", key: "alert", value: 1 }],
              effects: [{ type: "clock.inc", id: "clk_alert", by: 1 }],
            },
          ],
        },
      },
      "danger",
    );

    expect(row.outcome).toBe("Pressure consequence");
  });

  it("prefers opportunity truth over missing resolution text", () => {
    const row = buildAdventureHistoryRowViewModel(
      {
        id: "turn-opportunity",
        turnIndex: 4,
        playerInput: "DO: hide in shadow",
        scene: "Hallway",
        resolution: "",
        stateDeltas: [],
        ledgerAdds: [],
        createdAt: new Date().toISOString(),
        opportunityTruth: {
          rulesTriggered: [
            {
              ruleId: "SHADOW_HIDE_OPPORTUNITY",
              matchedConditions: [{ type: "intentMode", mode: "DO" }],
              effects: [{ type: "window.set", windowNarrowed: false, opportunityTier: "normal", detail: "Deep shadows make concealment easier." }],
            },
          ],
        },
      },
      "calm",
    );

    expect(row.outcome).toBe("Opportunity");
  });
});

describe("opportunity ranking alignment", () => {
  it("best response aligns with dominant risk", () => {
    const ranked = rankOpportunities(
      [
        {
          id: "break",
          key: "break_line_of_sight",
          label: "Break line of sight",
          description: "Break line of sight.",
        },
        {
          id: "strike",
          key: "strike_from_cover",
          label: "Strike from cover",
          description: "Strike from cover.",
        },
      ],
      {
        positionState: "exposed",
        pressure: { noise: 3, danger: 1, suspicion: 0, time: 0 },
        environmentHazards: { fire: null },
      },
      "exposure_risk",
    );

    expect(ranked[0]?.key).toBe("break_line_of_sight");
    expect(isAligned("break_line_of_sight", "exposure_risk")).toBe(true);
  });

  it("prefers fire responses when fire is active", () => {
    const ranked = rankOpportunities(
      [
        {
          id: "ignite",
          key: "ignite_oil",
          label: "Ignite the oil",
          description: "Ignite the oil.",
        },
        {
          id: "retreat",
          key: "retreat_from_flames",
          label: "Retreat from flames",
          description: "Retreat from flames.",
        },
      ],
      {
        positionState: "hidden",
        pressure: { noise: 0, danger: 1, suspicion: 0, time: 0 },
        environmentHazards: {
          fire: {
            status: "oiled",
            intensity: 0,
            fuel: 3,
          },
        },
      },
      "fire_active",
    );

    expect(ranked[0]?.key).toBe("retreat_from_flames");
    expect(isAligned("retreat_from_flames", "fire_active")).toBe(true);
    expect(ranked[0]?.score).toBeGreaterThan((ranked[1]?.score ?? 0));
  });

  it("does not elevate fire escalation over fire reduction", () => {
    const ranked = rankOpportunities(
      [
        {
          id: "ignite",
          key: "ignite_oil",
          label: "Ignite the oil",
          description: "Ignite the oil.",
        },
        {
          id: "retreat",
          key: "retreat_from_flames",
          label: "Retreat from flames",
          description: "Retreat from flames.",
        },
      ],
      {
        positionState: "exposed",
        pressure: { noise: 2, danger: 2, suspicion: 0, time: 0 },
        environmentHazards: {
          fire: {
            status: "burning",
            intensity: 1,
            fuel: 2,
          },
        },
      },
      "fire_active",
    );

    expect(ranked[0]?.key).toBe("retreat_from_flames");
    expect(ranked[0]?.score).toBeGreaterThan((ranked[1]?.score ?? 0));
  });

  it("prefers stealth responses when search is active", () => {
    const ranked = rankOpportunities(
      [
        {
          id: "strike",
          key: "strike_from_cover",
          label: "Strike from cover",
          description: "Strike from cover.",
        },
        {
          id: "evade",
          key: "evade_search",
          label: "Evade search",
          description: "Evade search.",
        },
      ],
      {
        positionState: "contested",
        pressure: { noise: 3, danger: 0, suspicion: 0, time: 0 },
      },
      "search_active",
    );

    expect(ranked[0]?.key).toBe("evade_search");
    expect(isAligned("evade_search", "search_active")).toBe(true);
  });

  it("defensive response outranks offensive under exposure", () => {
    const ranked = rankOpportunities(
      [
        {
          id: "break",
          key: "break_line_of_sight",
          label: "Break line of sight",
          description: "Break line of sight.",
        },
        {
          id: "strike",
          key: "strike_from_cover",
          label: "Strike from cover",
          description: "Strike from cover.",
        },
      ],
      {
        positionState: "exposed",
        pressure: { noise: 3, danger: 1, suspicion: 0, time: 0 },
      },
      "exposure_risk",
    );

    expect(ranked[0]?.key).toBe("break_line_of_sight");
    expect(ranked[0]?.score).toBeGreaterThan((ranked[1]?.score ?? 0));
  });
});
