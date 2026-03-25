import { describe, expect, it } from "vitest";
import { decideFocusShotTrigger, type FocusShotVisualState } from "@/lib/scene-art/focusShotTriggerPolicy";

describe("decideFocusShotTrigger", () => {
  const base: FocusShotVisualState = { visualMilestones: [] };

  it("captures artifact reveal", () => {
    const result = decideFocusShotTrigger(base, { visualMilestones: ["artifact_revealed"] });
    expect(result.shouldGenerate).toBe(true);
    expect(result.tier).toBe("medium");
    expect(result.reason).toBe("artifact_revealed");
  });

  it("captures major reveal", () => {
    const result = decideFocusShotTrigger(base, { visualMilestones: ["major_reveal"] });
    expect(result.shouldGenerate).toBe(true);
    expect(result.tier).toBe("medium");
    expect(result.reason).toBe("major_reveal");
  });

  it("captures legendary reveal", () => {
    const result = decideFocusShotTrigger(base, { visualMilestones: ["legendary_item_revealed"] });
    expect(result.shouldGenerate).toBe(true);
    expect(result.tier).toBe("high");
    expect(result.reason).toBe("legendary_item_revealed");
  });

  it("captures boss reveal", () => {
    const result = decideFocusShotTrigger(base, { visualMilestones: ["boss_reveal"] });
    expect(result.shouldGenerate).toBe(true);
    expect(result.tier).toBe("high");
    expect(result.reason).toBe("boss_reveal");
  });

  it("ignores no-op", () => {
    const next: FocusShotVisualState = { visualMilestones: [] };
    const result = decideFocusShotTrigger(base, next);
    expect(result.shouldGenerate).toBe(false);
    expect(result.reason).toBe(null);
  });

  it("ignores important inspect without milestone", () => {
    const prev: FocusShotVisualState = { visualMilestones: ["artifact_revealed"] };
    const result = decideFocusShotTrigger(prev, prev);
    expect(result.shouldGenerate).toBe(false);
  });
});
