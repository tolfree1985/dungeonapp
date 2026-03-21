import { describe, expect, it } from "vitest";
import { buildSceneShotKey } from "./sceneShot";
import { resolveSceneDeltaKind, type SceneDeltaSnapshot } from "./resolveSceneDeltaKind";
import { resolveSceneRefreshDecision } from "./resolveSceneRefreshDecision";
import type { SceneActorState } from "./resolveSceneActorState";
import type { SceneFramingState } from "./resolveSceneFramingState";
import type { SceneSubjectState } from "./resolveSceneSubjectState";
import type { SceneVisualState } from "./resolveSceneVisualState";

const baseVisualState: SceneVisualState = {
  locationId: "room_start",
  timeValue: "10",
  pressureStage: "crisis",
  lightingState: "failing",
  atmosphereState: "chaotic",
  environmentWear: "breaking",
  threatPresence: "imminent",
};

const baseFramingState: SceneFramingState = {
  frameKind: "threat_focus",
  shotScale: "medium",
  subjectFocus: "threat",
  cameraAngle: "low",
};

const baseSubjectState: SceneSubjectState = {
  primarySubjectKind: "threat",
  primarySubjectId: "threat-1",
  primarySubjectLabel: "looming threat",
};

const baseActorState: SceneActorState = {
  primaryActorId: "threat-actor",
  primaryActorLabel: "defiant sentinel",
  primaryActorRole: "threat",
  actorVisible: true,
};

const baseSnapshot: SceneDeltaSnapshot = {
  sceneKey: "scene-base",
  visualState: baseVisualState,
  framingState: baseFramingState,
  subjectState: baseSubjectState,
  actorState: baseActorState,
  basePrompt: "base prompt",
  canonicalTags: ["ambient"],
};

type SnapshotOverrides = Partial<Omit<SceneDeltaSnapshot, "visualState" | "framingState" | "subjectState" | "actorState">> & {
  visualState?: Partial<SceneVisualState>;
  framingState?: Partial<SceneFramingState>;
  subjectState?: Partial<SceneSubjectState>;
  actorState?: Partial<SceneActorState>;
};

function makeSnapshot(overrides: SnapshotOverrides = {}): SceneDeltaSnapshot {
  return {
    sceneKey: overrides.sceneKey ?? baseSnapshot.sceneKey,
    visualState: {
      ...baseVisualState,
      ...(overrides.visualState ?? {}),
    },
    framingState: {
      ...baseFramingState,
      ...(overrides.framingState ?? {}),
    },
    subjectState: {
      ...baseSubjectState,
      ...(overrides.subjectState ?? {}),
    },
    actorState: {
      ...baseActorState,
      ...(overrides.actorState ?? {}),
    },
    basePrompt: overrides.basePrompt ?? baseSnapshot.basePrompt,
    canonicalTags: overrides.canonicalTags ?? baseSnapshot.canonicalTags,
  };
}

const baseShotIdentity = {
  frameKind: baseFramingState.frameKind,
  shotScale: baseFramingState.shotScale,
  cameraAngle: baseFramingState.cameraAngle,
  subjectFocus: baseFramingState.subjectFocus,
  primarySubjectId: baseSubjectState.primarySubjectId,
};

describe("scene continuity invariants", () => {
  it("reuses the previous scene key when a shot persists", () => {
    const previous = makeSnapshot({ sceneKey: "scene-shot" });
    const current = makeSnapshot({ sceneKey: "scene-shot" });
    const deltaKind = resolveSceneDeltaKind(previous, current);
    expect(deltaKind).toBe("none");
    const refreshDecision = resolveSceneRefreshDecision({
      transitionType: "hold",
      currentSceneKey: current.sceneKey,
      previousSceneKey: previous.sceneKey,
      currentReady: true,
      previousReady: true,
      sceneDeltaKind: deltaKind,
    });
    expect(refreshDecision.renderPlan).toBe("reuse-current");
    expect(refreshDecision.shouldReuseCurrentImage).toBe(true);
  });

  it("detects environment changes and queues a render", () => {
    const previous = makeSnapshot({ sceneKey: "scene-base" });
    const current = makeSnapshot({
      sceneKey: "scene-new",
      visualState: { environmentWear: "destroyed" },
    });
    const deltaKind = resolveSceneDeltaKind(previous, current);
    expect(deltaKind).toBe("environment");
    const refreshDecision = resolveSceneRefreshDecision({
      transitionType: "cut",
      currentSceneKey: current.sceneKey,
      previousSceneKey: previous.sceneKey,
      currentReady: false,
      previousReady: true,
      sceneDeltaKind: deltaKind,
    });
    expect(refreshDecision.renderPlan).toBe("queue-full-render");
    expect(refreshDecision.shouldQueueRender).toBe(true);
  });

  it("generates different shot keys when the framing changes", () => {
    const firstShot = buildSceneShotKey(baseShotIdentity);
    const secondShot = buildSceneShotKey({
      ...baseShotIdentity,
      shotScale: "close",
    });
    expect(firstShot).not.toBe(secondShot);
  });
});
