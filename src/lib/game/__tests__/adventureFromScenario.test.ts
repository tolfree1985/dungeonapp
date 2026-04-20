import { describe, expect, it } from "vitest";
import { buildAdventureStateFromScenario } from "@/lib/game/adventureFromScenario";

describe("buildAdventureStateFromScenario", () => {
  it("clears runtime opportunity fields for a fresh run when not explicitly set", () => {
    const state = buildAdventureStateFromScenario({
      title: "Fresh Run",
      start: { prompt: "You wake in a hall." },
      initialState: {
        stats: { heat: 0, trust: 1 },
        flags: { toneLock: true },
      },
    });

    expect(state.opportunityWindow).toBeNull();
    expect(state.opportunityCooldowns).toEqual({});
    expect(state.pendingReactions).toEqual([]);
    expect((state as any).pressure).toBeUndefined();
    expect(state._meta.openingPrompt).toBe("You wake in a hall.");
  });

  it("preserves explicit scenario-defined runtime fields", () => {
    const state = buildAdventureStateFromScenario({
      title: "Preset Run",
      start: { prompt: "You wake in a hall." },
      initialState: {
        opportunityWindow: {
          type: "shadow_hide",
          source: "environment.shadow",
          quality: "clean",
          createdAtTurn: 0,
          consumableOnTurn: 1,
          expiresAtTurn: 1,
          expiresAt: 1,
          conditions: { hidden: true },
          status: "active",
          createdTurnIndex: 0,
        },
        opportunityCooldowns: {
          shadow_hide: {
            reason: "consumed",
            atTurn: 2,
            expiresAtTurn: 3,
            blockingConditions: { "guard.searching": true },
          },
        },
        pendingReactions: [
          {
            id: "reaction_1",
            kind: "investigation",
            cause: "scenario",
            sourceTurn: 0,
            triggerAtTurn: 1,
            locationId: "room_start",
            severity: 1,
          },
        ],
      },
    });

    expect(state.opportunityWindow).toMatchObject({
      type: "shadow_hide",
      status: "active",
    });
    expect(state.opportunityCooldowns).toHaveProperty("shadow_hide");
    expect(state.pendingReactions).toHaveLength(1);
  });
});
