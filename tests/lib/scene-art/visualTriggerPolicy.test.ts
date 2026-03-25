import { describe, expect, it } from "vitest";
import { decideSceneArtVisualTrigger, SceneArtVisualState } from "@/lib/scene-art/visualTriggerPolicy";

const baseState: SceneArtVisualState = {
  location: "harbor",
  pressureBand: "stable",
  encounterState: "calm",
  visualMilestones: [],
  importantObjectInspected: false,
};

describe("visual trigger policy", () => {
  it("triggers low tier when location changes", () => {
    const decision = decideSceneArtVisualTrigger(baseState, { ...baseState, location: "docks" });
    expect(decision.shouldGenerate).toBe(true);
    expect(decision.tier).toBe("low");
    expect(decision.reason).toBe("location_entered");
  });

  it("triggers medium tier when pressure band changes", () => {
    const decision = decideSceneArtVisualTrigger(baseState, { ...baseState, pressureBand: "tense" });
    expect(decision.shouldGenerate).toBe(true);
    expect(decision.tier).toBe("medium");
    expect(decision.reason).toBe("pressure_band_changed");
  });

  it("triggers medium tier when encounter changes", () => {
    const decision = decideSceneArtVisualTrigger(baseState, { ...baseState, encounterState: "alert" });
    expect(decision.shouldGenerate).toBe(true);
    expect(decision.tier).toBe("medium");
    expect(decision.reason).toBe("encounter_state_changed");
  });

  it("triggers high tier when legendary milestone appears", () => {
    const decision = decideSceneArtVisualTrigger(baseState, {
      ...baseState,
      visualMilestones: ["legendary_item_revealed"],
    });
    expect(decision.shouldGenerate).toBe(true);
    expect(decision.tier).toBe("high");
    expect(decision.reason).toBe("visual_milestone");
  });

  it("ignores important object inspection without milestone", () => {
    const decision = decideSceneArtVisualTrigger(baseState, {
      ...baseState,
      importantObjectInspected: true,
    });
    expect(decision.shouldGenerate).toBe(false);
    expect(decision.tier).toBeNull();
    expect(decision.reason).toBeNull();
  });

  it("returns false when nothing changed", () => {
    const decision = decideSceneArtVisualTrigger(baseState, { ...baseState });
    expect(decision.shouldGenerate).toBe(false);
  });
});
