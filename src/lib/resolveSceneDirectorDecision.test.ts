import { describe, expect, it } from "vitest";
import {
  resolveSceneDirectorDecision,
  type ResolveSceneDirectorDecisionArgs,
} from "./resolveSceneDirectorDecision";
import type { SceneDirectorDecision } from "./resolveSceneDirectorDecision";

const baseArgs: ResolveSceneDirectorDecisionArgs = {
  shotIntent: "observe",
  threatFraming: null,
  revealStructure: null,
  spatialHierarchy: { primarySubject: "environment", secondarySubject: null, dominance: "balanced" },
  compositionBias: { balance: "centered", depth: "layered", density: "balanced" },
  pressureStage: "tension",
  focusState: { focusType: "environment", focusId: "env", focusLabel: "Env" },
  sceneTransitionType: "hold",
  framingState: { frameKind: "wide_environment", shotScale: "wide", subjectFocus: "environment", cameraAngle: "level" },
  cameraMemory: null,
  previousDirectorDecision: null,
  sceneDeltaKind: null,
};

describe("resolveSceneDirectorDecision", () => {
  it("mirrors the shot intent as emphasis and composition bias", () => {
    const args = { ...baseArgs, shotIntent: "inspect" };
    const decision = resolveSceneDirectorDecision(args);
    expect(decision.emphasis).toBe("inspect");
    expect(decision.compositionBias).toBe("centered");
    expect(decision.shotScale).toBe("wide");
    expect(decision.cameraAngle).toBe("eye");
  });

  it("prefers threat-focused subjects when threat framing is dominant", () => {
    const args = {
      ...baseArgs,
      threatFraming: { threatLevel: "dominant", confrontationBias: "high", subjectDominance: "threat-favored" },
      focusState: { focusType: "environment", focusId: "room", focusLabel: "Room" },
    };
    const decision = resolveSceneDirectorDecision(args);
    expect(decision.focusSubject).toBe("threat");
  });

  it("maps actor focus to the actor subject label", () => {
    const args = {
      ...baseArgs,
      focusState: { focusType: "actor", focusId: "guard", focusLabel: "Guard" },
      spatialHierarchy: { primarySubject: "player", secondarySubject: "threat", dominance: "balanced" },
    };
    const decision = resolveSceneDirectorDecision(args);
    expect(decision.focusSubject).toBe("actor");
  });

  it("reuses the previous decision when the delta says motif", () => {
    const previous: SceneDirectorDecision = {
      shotScale: "medium",
      cameraAngle: "eye",
      focusSubject: "environment",
      compositionBias: "centered",
      emphasis: "inspect",
    };
    const args = {
      ...baseArgs,
      previousDirectorDecision: previous,
      sceneDeltaKind: "motif",
    };
    const decision = resolveSceneDirectorDecision(args);
    expect(decision).toBe(previous);
  });
});
