import { describe, expect, it } from "vitest";
import { resolveTimeAdvanceEffect } from "@/server/scene/time-advance-effects";

describe("resolveTimeAdvanceEffect", () => {
  it("returns null when no advance", () => {
    expect(resolveTimeAdvanceEffect({ timeAdvance: 0, pressure: 0, encounterPhase: "conversation" })).toBeNull();
  });

  it("returns deadline-pressure when pressure >= 3", () => {
    expect(resolveTimeAdvanceEffect({ timeAdvance: 1, pressure: 3, encounterPhase: "conflict" })).toBe("time.deadline-pressure");
  });

  it("returns scene-prolonged otherwise", () => {
    expect(resolveTimeAdvanceEffect({ timeAdvance: 1, pressure: 2, encounterPhase: "conversation" })).toBe("time.scene-prolonged");
  });
});
