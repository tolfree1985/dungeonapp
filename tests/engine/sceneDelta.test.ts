import { describe, expect, it } from "vitest";
import { detectSceneDelta } from "@/engine/sceneDelta";
import type { SceneDeltaSnapshot } from "@/lib/resolveSceneDeltaKind";
import type { SceneVisualState } from "@/lib/resolveSceneVisualState";
import type { SceneFramingState } from "@/lib/resolveSceneFramingState";
import type { SceneSubjectState } from "@/lib/resolveSceneSubjectState";
import type { SceneActorState } from "@/lib/resolveSceneActorState";

const visualState: SceneVisualState = {
  locationId: "room_start",
  timeValue: "01",
  pressureStage: "calm",
  lightingState: "stable",
  atmosphereState: "still",
  environmentWear: "intact",
  threatPresence: "absent",
};

const framingState: SceneFramingState = {
  frameKind: "threat_focus",
  shotScale: "medium",
  subjectFocus: "threat",
  cameraAngle: "low",
};

const subjectState: SceneSubjectState = {
  primarySubjectKind: "environment",
  primarySubjectId: "room",
  primarySubjectLabel: "room",
};

const actorState: SceneActorState = {
  primaryActorId: null,
  primaryActorLabel: null,
  primaryActorRole: null,
  actorVisible: false,
};

const buildSnapshot = (
  sceneKey: string,
  overrides: Partial<SceneVisualState> = {},
): SceneDeltaSnapshot => ({
  sceneKey,
  visualState: { ...visualState, ...overrides },
  framingState,
  subjectState,
  actorState,
  basePrompt: "base",
  canonicalTags: ["threat"],
});

describe("detectSceneDelta", () => {
  it("returns none when both snapshots match", () => {
    const snapshot = buildSnapshot("sceneA");
    const result = detectSceneDelta(snapshot, snapshot);
    expect(result).toBe("none");
  });

  it("returns scene-change when keys differ", () => {
    const previous = buildSnapshot("sceneA");
    const current = buildSnapshot("sceneB", { lightingState: "dim" });
    const result = detectSceneDelta(previous, current);
    expect(result).toBe("lighting-change");
  });
});
