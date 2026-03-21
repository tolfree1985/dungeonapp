import { describe, expect, it } from "vitest";
import type {
  SceneCameraContinuityState,
  SceneCameraMemory,
  SceneDirectorMemory,
  SceneTransitionMemory,
} from "@/lib/sceneTypes";
import { EMPTY_SCENE_TRANSITION_MEMORY } from "@/lib/sceneTypes";
import { applyShotTransitionRules } from "@/server/scene/shot-transition";

const baseTransitionMemory: SceneTransitionMemory = {
  preserveFraming: true,
  preserveSubject: true,
  preserveActor: true,
  preserveFocus: true,
};

const nextCameraMemory: SceneCameraMemory = {
  shotScale: "medium",
  cameraAngle: "eye",
  frameKind: "static",
  subjectFocus: "actor",
};

const baseContinuityState: SceneCameraContinuityState = {
  consecutiveAdvances: 2,
  cameraMemory: nextCameraMemory,
  directorMemory: null,
};

const baseDirectorMemory: SceneDirectorMemory = {
  shotScale: "medium",
  cameraAngle: "eye",
  focusSubject: "actor",
  compositionBias: "balanced",
  emphasis: "observe",
};

describe("applyShotTransitionRules", () => {
  it("preserves framing on short none holds", () => {
    const adjustment = applyShotTransitionRules({
      deltaKind: "none",
      sameScene: true,
      shotDuration: 2,
      transitionMemory: EMPTY_SCENE_TRANSITION_MEMORY,
      continuityState: baseContinuityState,
      nextCameraMemory,
    });

    expect(adjustment.transitionMemory).toEqual({
      preserveFraming: true,
      preserveSubject: true,
      preserveActor: true,
      preserveFocus: true,
    });
    expect(adjustment.continuityState.cameraMemory).toBe(nextCameraMemory);
    expect(adjustment.continuityState.consecutiveAdvances).toBe(baseContinuityState.consecutiveAdvances);
  });

  it("allows a slow evolution on long none holds", () => {
    const adjustment = applyShotTransitionRules({
      deltaKind: "none",
      sameScene: true,
      shotDuration: 4,
      transitionMemory: baseTransitionMemory,
      continuityState: {
        ...baseContinuityState,
        directorMemory: baseDirectorMemory,
      },
      nextCameraMemory,
    });

    expect(adjustment.transitionMemory.preserveFraming).toBe(false);
    expect(adjustment.transitionMemory.preserveSubject).toBe(true);
    expect(adjustment.transitionMemory.preserveActor).toBe(true);
    expect(adjustment.transitionMemory.preserveFocus).toBe(true);
    expect(adjustment.continuityState.cameraMemory).toBe(nextCameraMemory);
    expect(adjustment.continuityState.directorMemory).toBe(baseDirectorMemory);
    expect(adjustment.continuityState.consecutiveAdvances).toBe(baseContinuityState.consecutiveAdvances);
  });

  it("resets shot state on full scene changes", () => {
    const adjustment = applyShotTransitionRules({
      deltaKind: "full",
      sameScene: false,
      shotDuration: 1,
      transitionMemory: baseTransitionMemory,
      continuityState: {
        ...baseContinuityState,
        directorMemory: baseDirectorMemory,
      },
      nextCameraMemory,
    });

    expect(adjustment.transitionMemory).toEqual(EMPTY_SCENE_TRANSITION_MEMORY);
    expect(adjustment.continuityState.cameraMemory).toBeNull();
    expect(adjustment.continuityState.directorMemory).toBeNull();
    expect(adjustment.continuityState.consecutiveAdvances).toBe(0);
  });
});
