import { describe, expect, it } from "vitest";
import { resolveSceneCameraEscalationDecision } from "@/lib/resolveSceneCameraEscalationDecision";
import type { SceneFramingState } from "@/lib/resolveSceneFramingState";
import type { SceneFocusState } from "@/lib/resolveSceneFocusState";
import type { SceneTransitionMemory } from "@/lib/sceneTypes";
import type { SceneCameraContinuityState } from "@/lib/sceneTypes";

const baseFraming: SceneFramingState = {
  frameKind: "wide_environment",
  shotScale: "wide",
  subjectFocus: "environment",
  cameraAngle: "level",
};

const baseFocus: SceneFocusState = {
  focusType: "environment",
  focusId: "env",
  focusLabel: "Environment",
};

const advanceMemory: SceneTransitionMemory = {
  preserveFraming: true,
  preserveSubject: true,
  preserveActor: true,
  preserveFocus: false,
};

const holdMemory: SceneTransitionMemory = {
  preserveFraming: true,
  preserveSubject: true,
  preserveActor: true,
  preserveFocus: true,
};

const previousState: SceneCameraContinuityState = { consecutiveAdvances: 2 };

describe("resolveSceneCameraEscalationDecision", () => {
  it("resets the continuity counter when transition is not advance", () => {
    const result = resolveSceneCameraEscalationDecision({
      transitionType: "hold",
      currentFraming: baseFraming,
      currentFocus: baseFocus,
      pressureStage: "danger",
      previousContinuityState: previousState,
    });

    expect(result.shouldEscalateCamera).toBe(false);
    expect(result.nextContinuityState.consecutiveAdvances).toBe(0);
  });

  it("increments the counter but does not escalate under calm pressure", () => {
    const result = resolveSceneCameraEscalationDecision({
      transitionType: "advance",
      currentFraming: baseFraming,
      currentFocus: baseFocus,
      pressureStage: "calm",
      previousContinuityState: { consecutiveAdvances: 1 },
      transitionMemory: advanceMemory,
    });

    expect(result.shouldEscalateCamera).toBe(false);
    expect(result.nextContinuityState.consecutiveAdvances).toBe(2);
    expect(result.preferredScaleDelta).toBe(0);
  });

  it("escalates after repeated advances under danger when focus shifts", () => {
    const result = resolveSceneCameraEscalationDecision({
      transitionType: "advance",
      currentFraming: baseFraming,
      currentFocus: {
        focusType: "clue",
        focusId: "loose-stone",
        focusLabel: "Loose Stone",
      },
      pressureStage: "danger",
      previousContinuityState: { consecutiveAdvances: 1 },
      transitionMemory: advanceMemory,
    });

    expect(result.shouldEscalateCamera).toBe(true);
    expect(result.nextContinuityState.consecutiveAdvances).toBe(2);
    expect(result.preferredScaleDelta).toBe(1);
  });

  it("does not escalate when focus remains preserved even under high pressure", () => {
    const result = resolveSceneCameraEscalationDecision({
      transitionType: "advance",
      currentFraming: baseFraming,
      currentFocus: baseFocus,
      pressureStage: "danger",
      previousContinuityState: { consecutiveAdvances: 2 },
      transitionMemory: holdMemory,
    });

    expect(result.shouldEscalateCamera).toBe(false);
    expect(result.nextContinuityState.consecutiveAdvances).toBe(3);
    expect(result.preferredScaleDelta).toBe(0);
  });
});
