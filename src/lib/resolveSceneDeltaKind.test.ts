import { describe, expect, it } from "vitest";
import type { SceneActorState } from "@/lib/resolveSceneActorState";
import type { SceneFramingState } from "@/lib/resolveSceneFramingState";
import type { SceneSubjectState } from "@/lib/resolveSceneSubjectState";
import type { SceneVisualState } from "@/lib/resolveSceneVisualState";
import { resolveSceneDeltaKind } from "./resolveSceneDeltaKind";

type SnapshotOverrides = Partial<{
  visualState: SceneVisualState;
  framingState: SceneFramingState;
  subjectState: SceneSubjectState;
  actorState: SceneActorState;
  basePrompt: string;
  canonicalTags: string[];
}>;

const baseVisual: SceneVisualState = {
  locationId: "gallery",
  timeValue: "midnight",
  pressureStage: "tension",
  lightingState: "dim",
  atmosphereState: "still",
  environmentWear: "intact",
  threatPresence: "distant",
};

const baseFraming: SceneFramingState = {
  frameKind: "wide_environment",
  shotScale: "wide",
  subjectFocus: "environment",
  cameraAngle: "level",
};

const baseSubject: SceneSubjectState = {
  primarySubjectKind: "environment",
  primarySubjectId: "env-1",
  primarySubjectLabel: "Gallery",
};

const baseActor: SceneActorState = {
  primaryActorId: null,
  primaryActorLabel: null,
  primaryActorRole: null,
  actorVisible: false,
};

function makeSnapshot(overrides: SnapshotOverrides = {}) {
  return {
    sceneKey: "scene-1",
    visualState: overrides.visualState ?? baseVisual,
    framingState: overrides.framingState ?? baseFraming,
    subjectState: overrides.subjectState ?? baseSubject,
    actorState: overrides.actorState ?? baseActor,
    basePrompt: overrides.basePrompt ?? "gallery scene",
    canonicalTags: overrides.canonicalTags ?? ["hold", "calm"],
  };
}

describe("resolveSceneDeltaKind", () => {
  it("returns none when nothing changes", () => {
    const snapshot = makeSnapshot();
    expect(resolveSceneDeltaKind(snapshot, snapshot)).toBe("none");
  });

  it("returns camera-change when framing changes", () => {
    const previous = makeSnapshot();
    const next = makeSnapshot({ framingState: { ...baseFraming, shotScale: "medium" } });
    expect(resolveSceneDeltaKind(previous, next)).toBe("camera-change");
  });

  it("returns composition-change when the primary subject shifts", () => {
    const previous = makeSnapshot();
    const next = makeSnapshot({ subjectState: { ...baseSubject, primarySubjectKind: "detail" } });
    expect(resolveSceneDeltaKind(previous, next)).toBe("composition-change");
  });

  it("returns lighting-change when atmosphere or lighting changes", () => {
    const previous = makeSnapshot();
    const next = makeSnapshot({ visualState: { ...baseVisual, lightingState: "flickering" } });
    expect(resolveSceneDeltaKind(previous, next)).toBe("lighting-change");
  });

  it("returns environment when wear or threat changes", () => {
    const previous = makeSnapshot();
    const next = makeSnapshot({ visualState: { ...baseVisual, environmentWear: "disturbed" } });
    expect(resolveSceneDeltaKind(previous, next)).toBe("environment");
  });

  it("returns text-only when only the base prompt differs", () => {
    const previous = makeSnapshot();
    const next = makeSnapshot({ basePrompt: "different text" });
    expect(resolveSceneDeltaKind(previous, next)).toBe("text-only");
  });

  it("returns motif when only canonical tags shift", () => {
    const previous = makeSnapshot();
    const next = makeSnapshot({ canonicalTags: ["hold", "renewal"] });
    expect(resolveSceneDeltaKind(previous, next)).toBe("motif");
  });

  it("falls back to full when previous is missing", () => {
    const current = makeSnapshot();
    expect(resolveSceneDeltaKind(null, current)).toBe("full");
  });
});
