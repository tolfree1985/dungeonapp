import { describe, expect, it } from "vitest";
import { resolveSceneRevealStructure, buildRevealStructureTags } from "@/lib/resolveSceneRevealStructure";
import type { SceneFocusState } from "@/lib/resolveSceneFocusState";
import type { SceneTransition } from "@/lib/resolveSceneTransition";

const baseFocus: SceneFocusState = {
  focusType: "environment",
  focusId: "room",
  focusLabel: "Room",
};

const partialTransition: SceneTransition = {
  type: "advance",
  preserveFraming: true,
  preserveSubject: true,
  preserveActor: true,
  preserveFocus: false,
  focusHeld: false,
};

describe("resolveSceneRevealStructure", () => {
  it("returns hint stage for observe intent", () => {
    const structure = resolveSceneRevealStructure({
      shotIntent: "observe",
      focusState: baseFocus,
      motif: null,
      sceneTransition: partialTransition,
    });
    expect(structure.revealStage).toBe("hint");
    expect(structure.revealFocus).toBe("environment");
    expect(structure.revealClarity).toBe("fuzzy");
  });

  it("returns partial for inspect intent and detail focus", () => {
    const detailFocus: SceneFocusState = { ...baseFocus, focusType: "detail" };
    const structure = resolveSceneRevealStructure({
      shotIntent: "inspect",
      focusState: detailFocus,
      motif: { tone: "neutral", lighting: "even", atmosphere: "foggy" },
      sceneTransition: partialTransition,
    });
    expect(structure.revealStage).toBe("partial");
    expect(structure.revealFocus).toBe("detail");
    expect(structure.revealClarity).toBe("obscured");
  });

  it("returns full for reveal intent with clear motif", () => {
    const structure = resolveSceneRevealStructure({
      shotIntent: "reveal",
      focusState: baseFocus,
      motif: { tone: "neutral", lighting: "even", atmosphere: "clear" },
      sceneTransition: partialTransition,
    });
    expect(structure.revealStage).toBe("full");
    expect(structure.revealClarity).toBe("clear");
  });

  it("returns aftermath for threaten intent", () => {
    const structure = resolveSceneRevealStructure({
      shotIntent: "threaten",
      focusState: { ...baseFocus, focusType: "threat" },
      motif: { tone: "ominous", lighting: "harsh", atmosphere: "smoky" },
      sceneTransition: { ...partialTransition, type: "cut" },
    });
    expect(structure.revealStage).toBe("aftermath");
    expect(structure.revealFocus).toBe("threat");
    expect(structure.revealClarity).toBe("obscured");
  });
});

describe("buildRevealStructureTags", () => {
  it("maps stages to reveal tags", () => {
    expect(buildRevealStructureTags({ revealStage: "hint", revealFocus: "environment", revealClarity: "clear" })).toEqual(["reveal-hint"]);
    expect(buildRevealStructureTags({ revealStage: "partial", revealFocus: "detail", revealClarity: "obscured" })).toEqual([
      "reveal-partial",
    ]);
    expect(buildRevealStructureTags({ revealStage: "full", revealFocus: "threat", revealClarity: "clear" })).toEqual(["reveal-full"]);
    expect(buildRevealStructureTags({ revealStage: "aftermath", revealFocus: "actor", revealClarity: "fuzzy" })).toEqual([
      "reveal-aftermath",
    ]);
  });
});
