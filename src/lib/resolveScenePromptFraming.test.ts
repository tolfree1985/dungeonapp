import { describe, expect, it } from "vitest";
import {
  resolveScenePromptFraming,
  emphasisTagMap,
  intentCompositionNoteMap,
  intentVisualTagMap,
  revealTagMap,
  compositionBiasNotesMap,
} from "@/lib/resolveScenePromptFraming";
import type { SceneFramingState } from "@/lib/resolveSceneFramingState";
import type { SceneFocusState } from "@/lib/resolveSceneFocusState";
import type { SceneSubjectState } from "@/lib/resolveSceneSubjectState";
import type { SceneActorState } from "@/lib/resolveSceneActorState";
import type { SceneDirectorDecision } from "@/lib/resolveSceneDirectorDecision";
import type { SceneTransition } from "@/lib/resolveSceneTransition";
import type { SceneShotIntent } from "@/lib/resolveSceneShotIntent";
import { resolveSceneShotGrammar } from "@/lib/resolveSceneShotGrammar";

const framingState: SceneFramingState = {
  frameKind: "threat_focus",
  shotScale: "medium",
  subjectFocus: "threat",
  cameraAngle: "low",
};

const focus: SceneFocusState = {
  focusType: "actor",
  focusId: "guard",
  focusLabel: "Guard",
};

const subject: SceneSubjectState = {
  primarySubjectKind: "threat",
  primarySubjectId: "guard",
  primarySubjectLabel: "Guard",
};

const actor: SceneActorState = {
  primaryActorId: "guard",
  primaryActorLabel: "Guard",
  primaryActorRole: "threat",
  actorVisible: true,
};

const director: SceneDirectorDecision = {
  preferThreatFraming: false,
  allowCut: true,
  forceHold: false,
  escalateCamera: true,
};

const transition: SceneTransition = {
  type: "advance",
  preserveFraming: true,
  preserveSubject: true,
  preserveActor: true,
  preserveFocus: true,
  focusHeld: true,
};

function framingForIntent(intent: SceneShotIntent) {
  const grammar = resolveSceneShotGrammar({
    shotIntent: intent,
    directorDecision: director,
    framingState: framingState,
    focusState: focus,
    subjectState: subject,
    actorState: actor,
    sceneTransition: transition,
  });
  const promptFraming = resolveScenePromptFraming({
    shotIntent: intent,
    shotGrammar: grammar,
    directorDecision: director,
    framingState: framingState,
    focusState: focus,
    subjectState: subject,
    actorState: actor,
    sceneTransition: transition,
  });
  return { framing: promptFraming, shotGrammar: grammar };
}

describe("resolveScenePromptFraming", () => {
  it("produces deterministic tags for threaten intent", () => {
    const { framing, shotGrammar } = framingForIntent("threaten");
    const expectedTags = [
      "intent-threaten",
      ...intentVisualTagMap.threaten,
      ...emphasisTagMap[shotGrammar.emphasis],
      revealTagMap[shotGrammar.revealLevel],
    ];
    const expectedNotes = [...intentCompositionNoteMap.threaten, ...compositionBiasNotesMap[shotGrammar.compositionBias]];
    expect(framing.visualTags).toEqual(expectedTags);
    expect(framing.compositionNotes).toEqual(expectedNotes);
  });

  it("produces deterministic tags for inspect intent", () => {
    const { framing, shotGrammar } = framingForIntent("inspect");
    const expectedTags = [
      "intent-inspect",
      ...intentVisualTagMap.inspect,
      ...emphasisTagMap[shotGrammar.emphasis],
      revealTagMap[shotGrammar.revealLevel],
    ];
    const expectedNotes = [...intentCompositionNoteMap.inspect, ...compositionBiasNotesMap[shotGrammar.compositionBias]];
    expect(framing.visualTags).toEqual(expectedTags);
    expect(framing.compositionNotes).toEqual(expectedNotes);
  });

  it("produces deterministic tags for reveal intent", () => {
    const { framing, shotGrammar } = framingForIntent("reveal");
    const expectedTags = [
      "intent-reveal",
      ...intentVisualTagMap.reveal,
      ...emphasisTagMap[shotGrammar.emphasis],
      revealTagMap[shotGrammar.revealLevel],
    ];
    const expectedNotes = [...intentCompositionNoteMap.reveal, ...compositionBiasNotesMap[shotGrammar.compositionBias]];
    expect(framing.visualTags).toEqual(expectedTags);
    expect(framing.compositionNotes).toEqual(expectedNotes);
  });

  it("produces deterministic tags for isolate intent", () => {
    const { framing, shotGrammar } = framingForIntent("isolate");
    const expectedTags = [
      "intent-isolate",
      ...intentVisualTagMap.isolate,
      ...emphasisTagMap[shotGrammar.emphasis],
      revealTagMap[shotGrammar.revealLevel],
    ];
    const expectedNotes = [...intentCompositionNoteMap.isolate, ...compositionBiasNotesMap[shotGrammar.compositionBias]];
    expect(framing.visualTags).toEqual(expectedTags);
    expect(framing.compositionNotes).toEqual(expectedNotes);
  });

  it("produces deterministic tags for observe intent", () => {
    const { framing, shotGrammar } = framingForIntent("observe");
    const expectedTags = [
      "intent-observe",
      ...intentVisualTagMap.observe,
      ...emphasisTagMap[shotGrammar.emphasis],
      revealTagMap[shotGrammar.revealLevel],
    ];
    const expectedNotes = [...intentCompositionNoteMap.observe, ...compositionBiasNotesMap[shotGrammar.compositionBias]];
    expect(framing.visualTags).toEqual(expectedTags);
    expect(framing.compositionNotes).toEqual(expectedNotes);
  });
});
