import { describe, expect, it } from "vitest";
import { resolveSceneShotGrammar } from "@/lib/resolveSceneShotGrammar";
import type { SceneActorState } from "@/lib/resolveSceneActorState";
import type { SceneFramingState } from "@/lib/resolveSceneFramingState";
import type { SceneFocusState } from "@/lib/resolveSceneFocusState";
import type { SceneSubjectState } from "@/lib/resolveSceneSubjectState";
import type { SceneDirectorDecision } from "@/lib/resolveSceneDirectorDecision";
import type { SceneTransition } from "@/lib/resolveSceneTransition";

const framing: SceneFramingState = {
  frameKind: "wide_environment",
  shotScale: "wide",
  subjectFocus: "environment",
  cameraAngle: "level",
};

const focus: SceneFocusState = {
  focusType: "environment",
  focusId: null,
  focusLabel: null,
};

const subject: SceneSubjectState = {
  primarySubjectKind: "environment",
  primarySubjectId: null,
  primarySubjectLabel: null,
};

const actor: SceneActorState = {
  primaryActorId: null,
  primaryActorLabel: null,
  primaryActorRole: null,
  actorVisible: false,
};

const director: SceneDirectorDecision = {
  preferThreatFraming: true,
  allowCut: true,
  forceHold: false,
  escalateCamera: false,
};

const transition: SceneTransition = {
  type: "advance",
  preserveFraming: true,
  preserveSubject: true,
  preserveActor: true,
  preserveFocus: true,
  focusHeld: true,
};

describe("resolveSceneShotGrammar", () => {
  it("maps threaten intent to threat emphasis", () => {
    expect(
      resolveSceneShotGrammar({
        shotIntent: "threaten",
        directorDecision: null,
        framingState: framing,
        focusState: focus,
        subjectState: { ...subject, primarySubjectKind: "threat" },
        actorState: { ...actor, primaryActorRole: "threat" },
        sceneTransition: transition,
      })
    ).toEqual({ emphasis: "threat", compositionBias: "confrontational", revealLevel: "medium" });
  });

  it("maps inspect intent to detail emphasis", () => {
    expect(
      resolveSceneShotGrammar({
        shotIntent: "inspect",
        directorDecision: null,
        framingState: framing,
        focusState: { ...focus, focusType: "detail" },
        subjectState: { ...subject, primarySubjectKind: "detail" },
        actorState: actor,
        sceneTransition: transition,
      })
    ).toEqual({ emphasis: "detail", compositionBias: "singular", revealLevel: "low" });
  });

  it("maps reveal intent to high reveal level", () => {
    expect(
      resolveSceneShotGrammar({
        shotIntent: "reveal",
        directorDecision: director,
        framingState: framing,
        focusState: focus,
        subjectState: subject,
        actorState: actor,
        sceneTransition: { ...transition, type: "cut" },
      })
    ).toEqual({ emphasis: "environment", compositionBias: "balanced", revealLevel: "high" });
  });

  it("maps isolate intent to singular composition", () => {
    expect(
      resolveSceneShotGrammar({
        shotIntent: "isolate",
        directorDecision: director,
        framingState: { ...framing, shotScale: "close" },
        focusState: focus,
        subjectState: subject,
        actorState: { ...actor, actorVisible: true },
        sceneTransition: transition,
      })
    ).toEqual({ emphasis: "subject", compositionBias: "singular", revealLevel: "low" });
  });

  it("defaults to observe environment grammar", () => {
    expect(
      resolveSceneShotGrammar({
        shotIntent: "observe",
        directorDecision: null,
        framingState: framing,
        focusState: focus,
        subjectState: subject,
        actorState: actor,
        sceneTransition: transition,
      })
    ).toEqual({ emphasis: "environment", compositionBias: "balanced", revealLevel: "low" });
  });
});
