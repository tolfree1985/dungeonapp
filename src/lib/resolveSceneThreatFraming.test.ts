import { describe, expect, it } from "vitest";
import { resolveSceneThreatFraming, buildThreatFramingTags } from "@/lib/resolveSceneThreatFraming";
import type { SceneFocusState } from "@/lib/resolveSceneFocusState";
import type { SceneShotGrammar } from "@/lib/resolveSceneShotGrammar";
import type { SceneDirectorBehavior } from "@/lib/resolveSceneDirectorBehavior";
import type { SceneTransition } from "@/lib/resolveSceneTransition";
import type { SceneTransitionMemory } from "@/lib/sceneTypes";

const baseGrammar: SceneShotGrammar = {
  emphasis: "environment",
  compositionBias: "balanced",
  revealLevel: "low",
};

const baseDirector: SceneDirectorBehavior = {
  preferThreatFraming: false,
  allowCut: false,
  forceHold: false,
  escalateCamera: false,
};

const baseTransition: SceneTransition = {
  type: "hold",
  preserveFraming: true,
  preserveSubject: true,
  preserveActor: true,
  preserveFocus: true,
  focusHeld: true,
};

const baseMemory: SceneTransitionMemory = {
  preserveFraming: true,
  preserveSubject: true,
  preserveActor: true,
  preserveFocus: true,
};

const baseFocus: SceneFocusState = {
  focusType: "environment",
  focusId: "room",
  focusLabel: "Room",
};

function resolve(args: {
  shotIntent?: "observe" | "inspect" | "threaten" | "reveal";
  grammar?: SceneShotGrammar;
  motif?: { tone: string; lighting: string } | null;
  pressureStage?: string;
  focus?: SceneFocusState;
  director?: SceneDirectorBehavior;
  transition?: SceneTransition;
  memory?: SceneTransitionMemory;
}) {
  return resolveSceneThreatFraming({
    shotIntent: args.shotIntent ?? "observe",
    shotGrammar: args.grammar ?? baseGrammar,
    motif: args.motif ?? null,
    directorDecision: args.director ?? baseDirector,
    pressureStage: args.pressureStage ?? "calm",
    focusState: args.focus ?? baseFocus,
    sceneTransition: args.transition ?? baseTransition,
    transitionMemory: args.memory ?? baseMemory,
  });
}

describe("resolveSceneThreatFraming", () => {
  it("returns none/low/player-favored for calm observation", () => {
    expect(resolve({ shotIntent: "observe" })).toEqual({ threatLevel: "none", confrontationBias: "low", subjectDominance: "player-favored" });
  });

  it("returns present/medium/balanced for inspect detail", () => {
    const grammar = { ...baseGrammar, emphasis: "detail" };
    expect(resolve({ shotIntent: "inspect", grammar })).toEqual({ threatLevel: "present", confrontationBias: "medium", subjectDominance: "player-favored" });
  });

  it("returns dominant/high/threat-favored for danger + threaten focus", () => {
    const focus: SceneFocusState = { focusType: "threat", focusId: "guard", focusLabel: "Guard" };
    const motif = { tone: "ominous", lighting: "harsh" };
    const grammar = { emphasis: "threat", compositionBias: "confrontational", revealLevel: "medium" };
    expect(resolve({ shotIntent: "threaten", motif, pressureStage: "danger", focus, grammar })).toEqual({ threatLevel: "dominant", confrontationBias: "high", subjectDominance: "threat-favored" });
  });

  it("returns player-favored threat framing when pressure rises", () => {
    const focus: SceneFocusState = { focusType: "environment", focusId: "player", focusLabel: "You" };
    const transition: SceneTransition = { ...baseTransition, preserveFocus: false, type: "advance" };
    expect(resolve({ shotIntent: "observe", focus, transition, pressureStage: "danger" })).toEqual({ threatLevel: "present", confrontationBias: "medium", subjectDominance: "player-favored" });
  });

  it("returns identical output for identical inputs", () => {
    const a = resolve({
      shotIntent: "observe",
      grammar: baseGrammar,
      focus: baseFocus,
    });
    const b = resolve({
      shotIntent: "observe",
      grammar: baseGrammar,
      focus: baseFocus,
    });
    expect(a).toEqual(b);
  });
});

describe("buildThreatFramingTags", () => {
  it("returns empty array for none", () => {
    expect(buildThreatFramingTags({ threatLevel: "none", confrontationBias: "low", subjectDominance: "balanced" })).toEqual([]);
  });

  it("returns present tag for present threat", () => {
    expect(buildThreatFramingTags({ threatLevel: "present", confrontationBias: "medium", subjectDominance: "player-favored" })).toEqual(["threat present"]);
  });

  it("returns dominant tag for dominant threat", () => {
    expect(buildThreatFramingTags({ threatLevel: "dominant", confrontationBias: "high", subjectDominance: "threat-favored" })).toEqual(["dominant threat"]);
  });
});
