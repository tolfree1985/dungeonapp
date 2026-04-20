import { describe, expect, it } from "vitest";
import { WORLD_FLAGS } from "@/lib/engine/worldFlags";
import { evaluateOpportunityRules } from "@/server/turn/opportunityRules";
import { deriveOpportunityBenefit, evolveOpportunityWindow } from "@/lib/opportunity-window-state";
import type { OpportunityWindowLifecycleState } from "@/lib/opportunity-window-state";

function buildOpportunityContext() {
  return evaluateOpportunityRules({
    intentMode: "DO",
    normalizedInput: "hide in the shadows",
    sceneText: "Deep shadows cover the hallway",
    effectSummaries: [],
    sceneClock: 2,
  });
}

function buildPlainHideOpportunityContext() {
  return evaluateOpportunityRules({
    intentMode: "DO",
    normalizedInput: "hide in cover",
    sceneText: "A plain corridor",
    effectSummaries: [],
    sceneClock: 2,
  });
}

function summarizeWindow(window: OpportunityWindowLifecycleState | null) {
  if (!window) return null;
  return {
    type: window.type,
    source: window.source,
    createdAtTurn: window.createdAtTurn,
    consumableOnTurn: window.consumableOnTurn,
    expiresAtTurn: window.expiresAtTurn,
    expiresAt: window.expiresAt,
    status: window.status,
    createdTurnIndex: window.createdTurnIndex,
    consumedTurnIndex: window.consumedTurnIndex ?? null,
    conditions: window.conditions,
  };
}

function summarizeLifecycle(result: ReturnType<typeof evolveOpportunityWindow>) {
  return {
    transition: result.transition,
    opportunityWindow: summarizeWindow(result.opportunityWindow),
    ledgerAdds: result.ledgerAdds.map((entry) => ({
      kind: (entry as Record<string, unknown>).kind ?? null,
      cause: (entry as Record<string, unknown>).cause ?? null,
      effect: (entry as Record<string, unknown>).effect ?? null,
      detail: (entry as Record<string, unknown>).detail ?? null,
    })),
  };
}

describe("opportunity evolution contract", () => {
  it("creates and consumes a baseline hide opportunity from a plain room", () => {
    const context = buildPlainHideOpportunityContext();

    const created = evolveOpportunityWindow({
      previousWindow: null,
      opportunityTruth: context.opportunityTruth,
      opportunityWindowState: context.opportunityWindowState,
      sceneClock: 2,
      turnIndex: 40,
      action: "DO",
      normalizedInput: "hide in cover",
    });

    expect(created.transition).toBe("created");
    expect(created.opportunityWindow).toMatchObject({
      type: "shadow_hide",
      source: "environment.shadow",
      quality: "clean",
      status: "active",
      createdTurnIndex: 40,
      createdAtTurn: 2,
      consumableOnTurn: 3,
    });

    const consumed = evolveOpportunityWindow({
      previousWindow: created.opportunityWindow,
      opportunityTruth: context.opportunityTruth,
      opportunityWindowState: context.opportunityWindowState,
      sceneClock: 3,
      turnIndex: 41,
      action: "DO",
      normalizedInput: "strike from the shadows",
    });

    expect(consumed.transition).toBe("consumed");
    expect(consumed.opportunityWindow).toBeNull();
    expect(
      deriveOpportunityBenefit({
        previousWindow: created.opportunityWindow,
        stateFlags: {},
        normalizedInput: "strike from the shadows",
        action: "DO",
      }),
    ).toEqual(
      expect.objectContaining({
        kind: "reduced_cost",
        source: "hidden_window",
        quality: "clean",
      }),
    );
  });

  it("creates, persists, consumes, and expires deterministically", () => {
    const context = buildOpportunityContext();

    const created = evolveOpportunityWindow({
      previousWindow: null,
      opportunityTruth: context.opportunityTruth,
      opportunityWindowState: context.opportunityWindowState,
      sceneClock: 2,
      turnIndex: 10,
      action: "DO",
      normalizedInput: "hide in the shadows",
    });

    expect(created.transition).toBe("created");
    expect(created.opportunityWindow).toMatchObject({
      type: "shadow_hide",
      source: "environment.shadow",
      status: "active",
      createdTurnIndex: 10,
      createdAtTurn: 2,
      consumableOnTurn: 3,
      expiresAtTurn: 4,
      expiresAt: 4,
    });
    expect(created.ledgerAdds).toContainEqual(
      expect.objectContaining({
        kind: "opportunity.window",
        cause: "opportunity.created",
      }),
    );

    const persisted = evolveOpportunityWindow({
      previousWindow: created.opportunityWindow,
      opportunityTruth: context.opportunityTruth,
      opportunityWindowState: context.opportunityWindowState,
      sceneClock: 3,
      turnIndex: 11,
      action: "WAIT",
      normalizedInput: "wait",
    });

    expect(persisted.transition).toBe("persisted");
    expect(persisted.opportunityWindow).toMatchObject({
      type: created.opportunityWindow?.type,
      source: created.opportunityWindow?.source,
      expiresAt: created.opportunityWindow?.expiresAt,
      status: created.opportunityWindow?.status,
      createdTurnIndex: created.opportunityWindow?.createdTurnIndex,
      conditions: created.opportunityWindow?.conditions,
    });
    expect(persisted.ledgerAdds).toHaveLength(0);

    const consumed = evolveOpportunityWindow({
      previousWindow: created.opportunityWindow,
      opportunityTruth: context.opportunityTruth,
      opportunityWindowState: context.opportunityWindowState,
      sceneClock: 3,
      turnIndex: 12,
      action: "STEALTH",
      normalizedInput: "hide in the shadows",
    });

    expect(consumed.transition).toBe("consumed");
    expect(consumed.opportunityWindow).toBeNull();
    expect(consumed.ledgerAdds).toContainEqual(
      expect.objectContaining({
        kind: "opportunity.window",
        cause: "opportunity.consumed",
      }),
    );

    const strikeConsumed = evolveOpportunityWindow({
      previousWindow: created.opportunityWindow,
      opportunityTruth: context.opportunityTruth,
      opportunityWindowState: context.opportunityWindowState,
      sceneClock: 3,
      turnIndex: 12,
      action: "DO",
      normalizedInput: "strike from the shadows",
    });

    expect(strikeConsumed.transition).toBe("consumed");
    expect(strikeConsumed.opportunityWindow).toBeNull();
    expect(strikeConsumed.ledgerAdds).toContainEqual(
      expect.objectContaining({
        kind: "opportunity.window",
        cause: "opportunity.consumed",
      }),
    );
    expect(
      deriveOpportunityBenefit({
        previousWindow: created.opportunityWindow,
        stateFlags: {
          [WORLD_FLAGS.guard.alerted]: true,
        },
        normalizedInput: "strike from the shadows",
        action: "DO",
      }),
    ).toEqual(
      expect.objectContaining({
        kind: "reduced_cost",
        source: "hidden_window",
        quality: "clean",
        prevented: expect.arrayContaining(["noise increase", "alert increase"]),
      }),
    );

    expect(
      deriveOpportunityBenefit({
        previousWindow: {
          ...created.opportunityWindow!,
          quality: "contested",
        },
        stateFlags: {
          [WORLD_FLAGS.guard.searching]: true,
          [WORLD_FLAGS.status.exposed]: true,
        },
        normalizedInput: "strike from the shadows",
        action: "DO",
      }),
    ).toEqual(
      expect.objectContaining({
        kind: "reduced_cost",
        source: "hidden_window",
        quality: "contested",
        prevented: expect.arrayContaining(["noise increase"]),
      }),
    );

    const contestedContext = evaluateOpportunityRules({
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
    expect(contestedContext.opportunityTruth).toBeNull();
    expect(contestedContext.matchedRules).toHaveLength(0);

    const contestedCreated = evolveOpportunityWindow({
      previousWindow: null,
      opportunityTruth: contestedContext.opportunityTruth,
      opportunityWindowState: contestedContext.opportunityWindowState,
      sceneClock: 2,
      turnIndex: 30,
      action: "DO",
      normalizedInput: "hide in cover",
    });

    expect(contestedCreated.transition).toBe("none");
    expect(contestedCreated.opportunityWindow).toBeNull();

    const expired = evolveOpportunityWindow({
      previousWindow: created.opportunityWindow,
      opportunityTruth: null,
      opportunityWindowState: { windowNarrowed: false, opportunityTier: "normal" },
      sceneClock: 5,
      turnIndex: 13,
      action: "WAIT",
      normalizedInput: "wait",
    });

    expect(expired.transition).toBe("expired");
    expect(expired.opportunityWindow).toBeNull();
    expect(expired.ledgerAdds).toContainEqual(
      expect.objectContaining({
        kind: "opportunity.window",
        cause: "opportunity.expired",
      }),
    );

    const cooldownSuppressed = evolveOpportunityWindow({
      previousWindow: created.opportunityWindow,
      opportunityTruth: context.opportunityTruth,
      opportunityWindowState: context.opportunityWindowState,
      sceneClock: 5,
      turnIndex: 14,
      action: "DO",
      normalizedInput: "strike from the shadows",
      opportunityCooldowns: {
        shadow_hide: 5,
      },
    });

    expect(cooldownSuppressed.transition).toBe("expired");
    expect(cooldownSuppressed.opportunityWindow).toBeNull();
    expect(cooldownSuppressed.ledgerAdds).toContainEqual(
      expect.objectContaining({
        kind: "opportunity.window-pressure",
        cause: "opportunity.cooldown",
      }),
    );
  });

  it("replays the same lifecycle from the same inputs", () => {
    const runLifecycle = () => {
      const context = buildOpportunityContext();
      const created = evolveOpportunityWindow({
        previousWindow: null,
        opportunityTruth: context.opportunityTruth,
        opportunityWindowState: context.opportunityWindowState,
        sceneClock: 2,
        turnIndex: 20,
        action: "DO",
        normalizedInput: "hide in the shadows",
      });
      const persisted = evolveOpportunityWindow({
        previousWindow: created.opportunityWindow,
        opportunityTruth: context.opportunityTruth,
        opportunityWindowState: context.opportunityWindowState,
        sceneClock: 3,
        turnIndex: 21,
        action: "WAIT",
        normalizedInput: "wait",
      });
      const consumed = evolveOpportunityWindow({
        previousWindow: created.opportunityWindow,
        opportunityTruth: context.opportunityTruth,
        opportunityWindowState: context.opportunityWindowState,
        sceneClock: 3,
        turnIndex: 22,
        action: "STEALTH",
        normalizedInput: "hide in the shadows",
      });
      return [
        summarizeLifecycle(created),
        summarizeLifecycle(persisted),
        summarizeLifecycle(consumed),
      ];
    };

    expect(runLifecycle()).toEqual(runLifecycle());
  });
});
