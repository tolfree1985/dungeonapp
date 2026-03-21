import { describe, expect, it } from "vitest";
import { buildSceneKey, decideSceneDeltaKind } from "@/server/scene/scene-identity";
import type { SceneIdentity } from "@/server/scene/scene-identity";

const baseIdentity: SceneIdentity = {
  locationKey: "hallway",
  focalActorKey: "guard-1",
  objectiveKey: "investigate",
  encounterPhase: "investigation",
};

describe("scene identity helpers", () => {
  it("computes a stable key out of the main anchors", () => {
    const key = buildSceneKey(baseIdentity);
    expect(key).toBe("hallway::guard-1::investigate::investigation");
  });

  it("treats detail-only differences as no change", () => {
    const delta = decideSceneDeltaKind({
      previous: baseIdentity,
      current: baseIdentity,
      minutesElapsed: 2,
      detailOnlyChange: true,
    });
    expect(delta).toBe("none");
  });

  it("treats long holds as partial insight shifts", () => {
    const delta = decideSceneDeltaKind({
      previous: baseIdentity,
      current: baseIdentity,
      minutesElapsed: 20,
      detailOnlyChange: false,
    });
    expect(delta).toBe("partial");
  });

  it("marks objective changes as partial scenes", () => {
    const next: SceneIdentity = {
      ...baseIdentity,
      objectiveKey: "approach",
    };
    const delta = decideSceneDeltaKind({
      previous: baseIdentity,
      current: next,
      minutesElapsed: 0,
      detailOnlyChange: false,
    });
    expect(delta).toBe("partial");
  });

  it("requires a full change when the location moves", () => {
    const delta = decideSceneDeltaKind({
      previous: baseIdentity,
      current: { ...baseIdentity, locationKey: "courtyard" },
      minutesElapsed: 0,
      detailOnlyChange: false,
    });
    expect(delta).toBe("full");
  });

  it("counts major phase shifts as partial when everything else is stable", () => {
    const delta = decideSceneDeltaKind({
      previous: baseIdentity,
      current: { ...baseIdentity, encounterPhase: "conflict" },
      minutesElapsed: 0,
      detailOnlyChange: false,
    });
    expect(delta).toBe("partial");
  });
});
