import { describe, expect, it } from "vitest";
import { evaluateOpportunityRules } from "@/server/turn/opportunityRules";
import {
  evolveOpportunityWindow,
  settleOpportunityCooldowns,
  settleOpportunityWindowValidity,
} from "@/lib/opportunity-window-state";
import { WORLD_FLAGS } from "@/lib/engine/worldFlags";

function buildShadowOpportunity() {
  const rules = evaluateOpportunityRules({
    intentMode: "DO",
    normalizedInput: "hide in the shadows",
    sceneText: "Deep shadows cover the hallway",
    effectSummaries: [],
    sceneClock: 2,
  });
  return evolveOpportunityWindow({
    previousWindow: null,
    opportunityTruth: rules.opportunityTruth,
    opportunityWindowState: rules.opportunityWindowState,
    sceneClock: 2,
    turnIndex: 10,
    action: "DO",
    normalizedInput: "hide in the shadows",
  });
}

describe("opportunity invalidation contract", () => {
  it("persists while the opportunity remains valid and unrelated changes occur", () => {
    const created = buildShadowOpportunity();
    const persisted = settleOpportunityWindowValidity({
      opportunityWindow: created.opportunityWindow,
      state: {
        currentScene: { text: "Deep shadows cover the hallway" },
        flags: {
          [WORLD_FLAGS.cabinet.tipped]: true,
        },
      },
      sceneClock: 3,
    });

    expect(persisted.transition).toBe("persisted");
    expect(persisted.opportunityWindow).toMatchObject({
      type: "shadow_hide",
      source: "environment.shadow",
      status: "active",
      createdTurnIndex: 10,
    });
    expect(persisted.ledgerAdds).toHaveLength(0);
  });

  it("invalidates the shadow opportunity when the scene no longer supports shadows", () => {
    const created = buildShadowOpportunity();
    const invalidated = settleOpportunityWindowValidity({
      opportunityWindow: created.opportunityWindow,
      state: {
        currentScene: { text: "A plain corridor" },
        flags: {
          [WORLD_FLAGS.status.exposed]: true,
        },
      },
      sceneClock: 3,
    });

    expect(invalidated.transition).toBe("invalidated");
    expect(invalidated.opportunityWindow).toBeNull();
    expect(invalidated.ledgerAdds).toContainEqual(
      expect.objectContaining({
        kind: "opportunity.window",
        cause: "opportunity.invalidated",
        effect: "window.closed",
        data: expect.objectContaining({
          opportunityId: expect.stringContaining("shadow_hide:"),
        }),
      }),
    );
  });

  it("expires when the window reaches its TTL", () => {
    const created = buildShadowOpportunity();
    const expired = settleOpportunityWindowValidity({
      opportunityWindow: created.opportunityWindow,
      state: {
        currentScene: { text: "Deep shadows cover the hallway" },
        flags: {},
      },
      sceneClock: (created.opportunityWindow?.expiresAt ?? 0) + 1,
    });

    expect(expired.transition).toBe("expired");
    expect(expired.opportunityWindow).toBeNull();
    expect(expired.ledgerAdds).toContainEqual(
      expect.objectContaining({
        kind: "opportunity.window",
        cause: "opportunity.invalidated",
        effect: "window.closed",
      }),
    );
  });

  it("clears cooldowns when the blocking state changes and allows re-entry", () => {
    const activeCooldowns = {
      shadow_hide: {
        reason: "expired" as const,
        atTurn: 4,
        expiresAtTurn: 6,
        blockingConditions: {
          [WORLD_FLAGS.guard.searching]: true,
          [WORLD_FLAGS.status.exposed]: true,
          [WORLD_FLAGS.player.revealed]: true,
        },
      },
    };

    const stillBlocked = settleOpportunityCooldowns({
      opportunityCooldowns: activeCooldowns,
      state: {
        flags: {
          [WORLD_FLAGS.guard.searching]: true,
          [WORLD_FLAGS.status.exposed]: true,
          [WORLD_FLAGS.player.revealed]: true,
        },
      },
      sceneClock: 5,
    });

    expect(stillBlocked.opportunityCooldowns.shadow_hide).toBeDefined();
    expect(stillBlocked.ledgerAdds).toHaveLength(0);

    const cleared = settleOpportunityCooldowns({
      opportunityCooldowns: activeCooldowns,
      state: {
        flags: {
          [WORLD_FLAGS.guard.searching]: false,
          [WORLD_FLAGS.status.exposed]: false,
          [WORLD_FLAGS.player.revealed]: false,
        },
      },
      sceneClock: 5,
    });

    expect(cleared.opportunityCooldowns.shadow_hide).toBeUndefined();
    expect(cleared.ledgerAdds).toContainEqual(
      expect.objectContaining({
        kind: "opportunity.cooldown",
        cause: "opportunity.cooldown.cleared",
      }),
    );

    const rules = evaluateOpportunityRules({
      intentMode: "DO",
      normalizedInput: "hide in the shadows",
      sceneText: "Deep shadows cover the hallway",
      effectSummaries: [],
      stateFlags: {
        [WORLD_FLAGS.status.hidden]: true,
        [WORLD_FLAGS.status.exposed]: false,
        [WORLD_FLAGS.player.revealed]: false,
        [WORLD_FLAGS.guard.searching]: false,
      },
      sceneClock: 5,
    });

    const recreated = evolveOpportunityWindow({
      previousWindow: null,
      opportunityTruth: rules.opportunityTruth,
      opportunityWindowState: rules.opportunityWindowState,
      sceneClock: 5,
      turnIndex: 20,
      action: "DO",
      normalizedInput: "hide in the shadows",
      opportunityCooldowns: cleared.opportunityCooldowns,
    });

    expect(recreated.transition).toBe("created");
    expect(recreated.opportunityWindow).toMatchObject({
      type: "shadow_hide",
      status: "active",
    });
  });
});
