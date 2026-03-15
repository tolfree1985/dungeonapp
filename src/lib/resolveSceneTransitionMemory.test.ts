import { describe, expect, it } from "vitest";
import { resolveSceneTransitionMemory } from "./resolveSceneTransitionMemory";
import type { SceneFramingState } from "./resolveSceneFramingState";
import type { SceneSubjectState } from "./resolveSceneSubjectState";
import type { SceneActorState } from "./resolveSceneActorState";
import type { SceneFocusState } from "./resolveSceneFocusState";

const baseFraming: SceneFramingState = {
  frameKind: "wide_environment",
  shotScale: "wide",
  subjectFocus: "environment",
  cameraAngle: "level",
};

const baseSubject: SceneSubjectState = {
  primarySubjectKind: "environment",
  primarySubjectId: "room",
  primarySubjectLabel: "room",
};

const baseActor: SceneActorState = {
  primaryActorId: null,
  primaryActorLabel: null,
  primaryActorRole: null,
  actorVisible: false,
};

const baseFocus: SceneFocusState = {
  focusType: "environment",
  focusId: "room",
  focusLabel: "room",
};

describe("resolveSceneTransitionMemory", () => {
  it("preserves everything when the stack matches", () => {
    const decision = resolveSceneTransitionMemory({
      previousFraming: baseFraming,
      previousSubject: baseSubject,
      previousActor: baseActor,
      previousFocus: baseFocus,
      currentFraming: baseFraming,
      currentSubject: baseSubject,
      currentActor: baseActor,
      currentFocus: baseFocus,
    });
    expect(decision).toEqual({
      preserveFraming: true,
      preserveSubject: true,
      preserveActor: true,
      preserveFocus: true,
    });
  });

  it("preserves only framing when focus changes", () => {
    const changedFocus: SceneFocusState = {
      focusType: "object",
      focusId: "clue-a",
      focusLabel: "clue A",
    };
    const decision = resolveSceneTransitionMemory({
      previousFraming: baseFraming,
      previousSubject: baseSubject,
      previousActor: baseActor,
      previousFocus: baseFocus,
      currentFraming: baseFraming,
      currentSubject: baseSubject,
      currentActor: baseActor,
      currentFocus: changedFocus,
    });
    expect(decision).toEqual({
      preserveFraming: true,
      preserveSubject: true,
      preserveActor: true,
      preserveFocus: false,
    });
  });

  it("drops actor preservation when actor changes", () => {
    const newActor: SceneActorState = {
      primaryActorId: "guard-1",
      primaryActorLabel: "Guard",
      primaryActorRole: "threat",
      actorVisible: true,
    };
    const decision = resolveSceneTransitionMemory({
      previousFraming: baseFraming,
      previousSubject: baseSubject,
      previousActor: baseActor,
      previousFocus: baseFocus,
      currentFraming: baseFraming,
      currentSubject: baseSubject,
      currentActor: newActor,
      currentFocus: baseFocus,
    });
    expect(decision).toEqual({
      preserveFraming: true,
      preserveSubject: true,
      preserveActor: false,
      preserveFocus: true,
    });
  });

  it("breaks preservation when framing and subject change", () => {
    const newFraming: SceneFramingState = {
      frameKind: "investigation_focus",
      shotScale: "close",
      subjectFocus: "clue",
      cameraAngle: "level",
    };
    const newSubject: SceneSubjectState = {
      primarySubjectKind: "clue",
      primarySubjectId: "clue-1",
      primarySubjectLabel: "Clue 1",
    };
    const decision = resolveSceneTransitionMemory({
      previousFraming: baseFraming,
      previousSubject: baseSubject,
      previousActor: baseActor,
      previousFocus: baseFocus,
      currentFraming: newFraming,
      currentSubject: newSubject,
      currentActor: baseActor,
      currentFocus: baseFocus,
    });
    expect(decision).toEqual({
      preserveFraming: false,
      preserveSubject: false,
      preserveActor: true,
      preserveFocus: true,
    });
  });
});
