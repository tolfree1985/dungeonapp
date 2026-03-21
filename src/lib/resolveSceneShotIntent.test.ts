import { describe, expect, it } from "vitest";
import { resolveSceneShotIntent } from "@/lib/resolveSceneShotIntent";
import type { SceneActorState } from "@/lib/resolveSceneActorState";
import type { SceneFocusState } from "@/lib/resolveSceneFocusState";
import type { SceneFramingState } from "@/lib/resolveSceneFramingState";
import type { SceneSubjectState } from "@/lib/resolveSceneSubjectState";
import type { SceneTransition } from "@/lib/resolveSceneTransition";

const framingState: SceneFramingState = {
  frameKind: "wide_environment",
  shotScale: "wide",
  subjectFocus: "environment",
  cameraAngle: "level",
};

const focusState: SceneFocusState = {
  focusType: "environment",
  focusId: "stone gallery",
  focusLabel: "stone gallery",
};

const subjectState: SceneSubjectState = {
  primarySubjectKind: "environment",
  primarySubjectId: "stone gallery",
  primarySubjectLabel: "stone gallery",
};

const actorState: SceneActorState = {
  primaryActorId: null,
  primaryActorLabel: null,
  primaryActorRole: null,
  actorVisible: false,
};

describe("resolveSceneShotIntent", () => {
  it("returns threaten when pressure is high and focus is threat", () => {
    const transition: SceneTransition = {
      type: "advance",
      preserveFraming: true,
      preserveSubject: true,
      preserveActor: true,
      preserveFocus: true,
      focusHeld: true,
    };

    const result = resolveSceneShotIntent({
      pressureStage: "danger",
      focusState,
      subjectState: { ...subjectState, primarySubjectKind: "threat" },
      actorState: { ...actorState, primaryActorRole: "threat" },
      framingState,
      sceneTransition: transition,
    });

    expect(result).toBe("threaten");
  });

  it("returns isolate when camera is close and actor visible under pressure", () => {
    const transition: SceneTransition = {
      type: "advance",
      preserveFraming: true,
      preserveSubject: true,
      preserveActor: true,
      preserveFocus: true,
      focusHeld: true,
    };

    const result = resolveSceneShotIntent({
      pressureStage: "danger",
      focusState,
      subjectState,
      actorState: { ...actorState, actorVisible: true, primaryActorRole: "guide" },
      framingState: { ...framingState, shotScale: "close" },
      sceneTransition: transition,
    });

    expect(result).toBe("isolate");
  });

  it("returns inspect when focus moves to detail", () => {
    const transition: SceneTransition = {
      type: "advance",
      preserveFraming: true,
      preserveSubject: true,
      preserveActor: true,
      preserveFocus: false,
      focusHeld: false,
    };

    const result = resolveSceneShotIntent({
      pressureStage: "tension",
      focusState: { ...focusState, focusType: "detail" },
      subjectState: { ...subjectState, primarySubjectKind: "detail" },
      actorState,
      framingState,
      sceneTransition: transition,
    });

    expect(result).toBe("inspect");
  });

  it("returns reveal when there is a cut", () => {
    const transition: SceneTransition = {
      type: "cut",
      preserveFraming: false,
      preserveSubject: false,
      preserveActor: false,
      preserveFocus: false,
      focusHeld: false,
    };

    const result = resolveSceneShotIntent({
      pressureStage: "calm",
      focusState,
      subjectState,
      actorState,
      framingState,
      sceneTransition: transition,
    });

    expect(result).toBe("reveal");
  });

  it("defaults to observe when nothing else matches", () => {
    const transition: SceneTransition = {
      type: "hold",
      preserveFraming: true,
      preserveSubject: true,
      preserveActor: true,
      preserveFocus: true,
      focusHeld: true,
    };

    const result = resolveSceneShotIntent({
      pressureStage: "calm",
      focusState,
      subjectState,
      actorState,
      framingState,
      sceneTransition: transition,
    });

    expect(result).toBe("observe");
  });
});
