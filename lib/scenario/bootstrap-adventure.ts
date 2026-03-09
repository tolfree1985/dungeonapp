import type { ScenarioV1 } from "../../schemas/scenario.v1";

export type BootstrappedAdventure = {
  state: Record<string, unknown>;
  openingPrompt: string;
  memoryCards: ScenarioV1["memoryCards"] | undefined;
  locks: ScenarioV1["locks"] | undefined;
};

export function bootstrapAdventureFromScenario(scenario: ScenarioV1): BootstrappedAdventure {
  return {
    state: structuredClone(scenario.initialState) as Record<string, unknown>,
    openingPrompt: scenario.start.prompt,
    memoryCards: scenario.memoryCards,
    locks: scenario.locks,
  };
}
