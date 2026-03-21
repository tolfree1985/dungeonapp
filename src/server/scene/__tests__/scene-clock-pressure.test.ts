import { describe, expect, it } from "vitest";
import { resolveSceneClockPressure } from "@/server/scene/scene-clock-pressure";

describe("resolveSceneClockPressure", () => {
  it("ignores different scenes", () => {
    expect(
      resolveSceneClockPressure({ sceneClock: 5, sameScene: false, encounterPhase: "conversation", currentPressure: 5 }),
    ).toEqual({ deltaKindOverride: null, timingStateEffect: null });
  });

  it("emits objective.window-narrowed when clock>=4 and pressure>=3", () => {
    expect(
      resolveSceneClockPressure({ sceneClock: 4, sameScene: true, encounterPhase: "conflict", currentPressure: 3 }),
    ).toEqual({ deltaKindOverride: "partial", timingStateEffect: "objective.window-narrowed" });
  });

  it("emits scene.stalled when clock>=3 and phase is conversation", () => {
    expect(
      resolveSceneClockPressure({ sceneClock: 3, sameScene: true, encounterPhase: "conversation", currentPressure: 2 }),
    ).toEqual({ deltaKindOverride: "partial", timingStateEffect: "scene.stalled" });
  });
});
