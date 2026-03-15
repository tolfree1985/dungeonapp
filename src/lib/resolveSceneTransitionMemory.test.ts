import { describe, expect, it } from "vitest";
import { resolveSceneTransitionMemory } from "./resolveSceneTransitionMemory";
import { EMPTY_SCENE_TRANSITION_MEMORY } from "./sceneTypes";
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
  it("returns empty memory for the first scene", () => {
    const decision = resolveSceneTransitionMemory({
      previous: null,
      current: {
        framing: baseFraming,
        subject: baseSubject,
        actor: baseActor,
        focus: baseFocus,
      },
    });
    expect(decision).toEqual(EMPTY_SCENE_TRANSITION_MEMORY);
  });

  it("preserves everything when the stack matches", () => {
    const decision = resolveSceneTransitionMemory({
      previous: {
        framing: baseFraming,
        subject: baseSubject,
        actor: baseActor,
        focus: baseFocus,
      },
      current: {
        framing: baseFraming,
        subject: baseSubject,
        actor: baseActor,
        focus: baseFocus,
      },
    });
    expect(decision).toEqual({
      preserveFraming: true,
      preserveSubject: true,
      preserveActor: true,
      preserveFocus: true,
    });
  });

  it("drops only focus preservation when focus changes", () => {
    const changedFocus: SceneFocusState = {
      focusType: "object",
      focusId: "clue-a",
      focusLabel: "clue A",
    };
    const decision = resolveSceneTransitionMemory({
      previous: {
        framing: baseFraming,
        subject: baseSubject,
        actor: baseActor,
        focus: baseFocus,
      },
      current: {
        framing: baseFraming,
        subject: baseSubject,
        actor: baseActor,
        focus: changedFocus,
      },
    });
    expect(decision).toEqual({
      preserveFraming: true,
      preserveSubject: true,
      preserveActor: true,
      preserveFocus: false,
    });
  });

  it("respects prior memory when subject remains but framing changes", () => {
    const newFraming: SceneFramingState = {
      frameKind: "investigation_focus",
      shotScale: "close",
      subjectFocus: "clue",
      cameraAngle: "level",
    };
    const memory = {
      preserveFraming: false,
      preserveSubject: true,
      preserveActor: true,
      preserveFocus: true,
    };
    const decision = resolveSceneTransitionMemory({
      previousMemory: memory,
      previous: {
        framing: baseFraming,
        subject: baseSubject,
        actor: baseActor,
        focus: baseFocus,
      },
      current: {
        framing: newFraming,
        subject: baseSubject,
        actor: baseActor,
        focus: baseFocus,
      },
    });
    expect(decision).toEqual({
      preserveFraming: false,
      preserveSubject: true,
      preserveActor: true,
      preserveFocus: true,
    });
  });
});
