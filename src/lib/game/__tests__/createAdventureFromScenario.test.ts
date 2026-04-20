import { describe, expect, it } from "vitest";
import { buildAdventureStateFromScenario } from "@/lib/game/adventureFromScenario";
import { createAdventureFromScenario } from "@/lib/game/createAdventureFromScenario";

function makeScenario() {
  return {
    id: "dungeon-expedition-seed",
    title: "Dungeon Expedition",
    start: { prompt: "You stand before the ruined gate." },
    initialState: {
      stats: { heat: 0, trust: 2 },
      flags: { toneLock: true },
    },
  };
}

describe("createAdventureFromScenario", () => {
  function expectCleanTurnZeroContract(upsertArgs: any, turnArgs: any, scenarioId: string, prompt: string) {
    expect(upsertArgs.create.latestTurnIndex).toBe(0);
    expect((upsertArgs.create.state as any).pressure).toBeUndefined();
    expect(upsertArgs.create.state.opportunityWindow).toBeNull();
    expect(upsertArgs.create.state.opportunityCooldowns).toEqual({});
    expect(upsertArgs.create.state.pendingReactions).toEqual([]);
    expect(upsertArgs.create.state._meta.scenarioId).toBe(scenarioId);
    expect(upsertArgs.create.state._meta.openingPrompt).toBe(prompt);
    expect(turnArgs.data.turnIndex).toBe(0);
    expect(turnArgs.data.scene).toBe(prompt);
    expect(turnArgs.data.resolution).toEqual({});
    expect(turnArgs.data.stateDeltas).toEqual({});
    expect(turnArgs.data.ledgerAdds).toEqual([]);
  }

  it("boots a clean adventure state and Turn 0 from the same scenario content", async () => {
    const scenario = makeScenario();
    let upsertArgs: any = null;
    let turnArgs: any = null;

    const result = await createAdventureFromScenario({
      tx: {
        adventure: {
          findUnique: async () => null,
          upsert: async (args: any) => {
            upsertArgs = args;
            return { id: args.create.id, state: args.create.state };
          },
        },
        turn: {
          create: async (args: any) => {
            turnArgs = args;
            return {};
          },
        },
        scenario: {
          findUnique: async ({ where }: any) =>
            where?.id === scenario.id
              ? {
                  id: scenario.id,
                  contentJson: scenario,
                }
              : null,
        },
      } as any,
      scenarioId: scenario.id,
      ownerId: "user_1",
      seed: "seed-1",
    });

    const expectedState = buildAdventureStateFromScenario(scenario);

    expect(result.adventureId).toBeTruthy();
    expectCleanTurnZeroContract(upsertArgs, turnArgs, scenario.id, "You stand before the ruined gate.");
    expect(upsertArgs.create.state.currentScene).toMatchObject(expectedState.currentScene ?? {});
  });

  it("keeps the clean Turn 0 contract stable for the canonical fresh-run bootstrap", async () => {
    const scenario = makeScenario();
    let upsertArgs: any = null;
    let turnArgs: any = null;

    await createAdventureFromScenario({
      tx: {
        adventure: {
          findUnique: async () => null,
          upsert: async (args: any) => {
            upsertArgs = args;
            return { id: args.create.id, state: args.create.state };
          },
        },
        turn: {
          create: async (args: any) => {
            turnArgs = args;
            return {};
          },
        },
        scenario: {
          findUnique: async ({ where }: any) =>
            where?.id === scenario.id
              ? {
                  id: scenario.id,
                  contentJson: scenario,
                }
              : null,
        },
      } as any,
      scenarioId: scenario.id,
      ownerId: "user_2",
      seed: null,
    });

    expectCleanTurnZeroContract(upsertArgs, turnArgs, scenario.id, "You stand before the ruined gate.");
  });
});
