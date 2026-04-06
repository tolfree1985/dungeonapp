import { describe, expect, it, vi } from "vitest";
import { assertAdventureCompatibility, buildCompatibilityInfo, CompatibilityError } from "@/lib/engine/contracts/assertAdventureCompatibility";
import { buildScenarioVersionStamp } from "@/lib/scenario/scenarioVersion";
import type { AdventureState } from "@/lib/engine/types/state";

const SAMPLE_SCENARIO = { id: "test-scenario", title: "Test" };

function makeState(compatibility: ReturnType<typeof buildCompatibilityInfo>, scenarioId = "test-scenario"): AdventureState {
  return {
    flags: {},
    stats: {},
    quests: {},
    inventory: { items: [] },
    worldItems: [],
    relationships: {},
    memory: [],
    currentScene: null,
    _meta: {
      openingPrompt: null,
      locationKey: null,
      timeKey: null,
      scenarioId,
      compatibility,
    },
  } as AdventureState;
}

describe("assertAdventureCompatibility", () => {
  it("passes when the stored hash matches the scenario", async () => {
    const stamp = buildScenarioVersionStamp(SAMPLE_SCENARIO);
    const compatibility = buildCompatibilityInfo({
      scenarioVersion: stamp.scenarioVersion,
      scenarioContentHash: stamp.contentHash,
    });
    const db = {
      scenario: {
        findUnique: vi.fn(() => Promise.resolve({ contentJson: SAMPLE_SCENARIO })),
      },
    };
    await expect(assertAdventureCompatibility({ db, state: makeState(compatibility) })).resolves.toEqual(compatibility);
    expect(db.scenario.findUnique).toHaveBeenCalled();
  });

  it("throws when the scenario hash has drifted", async () => {
    const stamp = buildScenarioVersionStamp(SAMPLE_SCENARIO);
    const compatibility = buildCompatibilityInfo({
      scenarioVersion: stamp.scenarioVersion,
      scenarioContentHash: "deadbeef",
    });
    const db = {
      scenario: {
        findUnique: vi.fn(() => Promise.resolve({ contentJson: SAMPLE_SCENARIO })),
      },
    };
    await expect(assertAdventureCompatibility({ db, state: makeState(compatibility) })).rejects.toBeInstanceOf(CompatibilityError);
  });
});
