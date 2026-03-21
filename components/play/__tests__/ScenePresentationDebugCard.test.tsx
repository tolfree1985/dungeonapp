// @vitest-environment jsdom

import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScenePresentationDebugCard } from "@/components/play/ScenePresentationDebugCard";
import type { SceneTransition } from "@/lib/resolveSceneTransition";
import type { ScenePresentation } from "@/lib/resolveTurnSceneArtPresentation";

describe("ScenePresentationDebugCard", () => {
  it("renders shot intent, grammar, ordered tags, and transition cue", () => {
    const presentation: ScenePresentation = {
      shotIntent: "inspect",
      shotGrammar: { emphasis: "detail", compositionBias: "singular", revealLevel: "low" },
      promptFraming: {
        visualTags: ["intent-inspect", "emphasis-detail", "detail-evidence"],
        compositionNotes: ["single-subject"],
      },
      threatFramingTags: ["threat present", "dominant threat"],
      revealStructure: {
        revealStage: "partial",
        revealFocus: "detail",
        revealClarity: "obscured",
      },
      revealStructureTags: ["reveal-partial"],
      spatialHierarchy: {
        primarySubject: "object",
        secondarySubject: "threat",
        dominance: "balanced",
      },
      compositionBias: {
        balance: "asymmetric",
        depth: "layered",
        density: "balanced",
      },
      directorDecision: {
        shotScale: "medium",
        cameraAngle: "eye",
        focusSubject: "environment",
        compositionBias: "centered",
        emphasis: "inspect",
      },
    };
    const transition: SceneTransition = {
      type: "advance",
      preserveFraming: true,
      preserveSubject: true,
      preserveActor: true,
      preserveFocus: false,
      focusHeld: false,
    };

    render(
      <ScenePresentationDebugCard
        presentation={presentation}
        transition={transition}
        transitionCue="Focus Shift"
      />
    );

    expect(screen.getByText("Shot intent")).toBeTruthy();
    expect(screen.getByText("inspect")).toBeTruthy();
    expect(screen.getByText("Shot grammar")).toBeTruthy();
    expect(screen.getByText("detail / singular / low")).toBeTruthy();
    const tags = presentation.promptFraming?.visualTags ?? [];
    tags.forEach((tag) => expect(screen.getByText(tag)).toBeTruthy());
    presentation.threatFramingTags?.forEach((tag) => expect(screen.getByText(tag)).toBeTruthy());
    expect(screen.getByText("partial · detail · obscured")).toBeTruthy();
    expect(screen.getByText("reveal-partial")).toBeTruthy();
    expect(screen.getByText("object / threat · balanced")).toBeTruthy();
    expect(screen.getByText("asymmetric · layered · balanced")).toBeTruthy();
    expect(screen.getByText("Transition")).toBeTruthy();
    expect(screen.getByText("advance")).toBeTruthy();
    expect(screen.getByText("Cue: Focus Shift")).toBeTruthy();
    expect(screen.getByText("Director")).toBeTruthy();
    expect(screen.getByText("inspect · centered · environment")).toBeTruthy();
    expect(screen.getByText("Camera")).toBeTruthy();
    expect(screen.getByText("medium / eye")).toBeTruthy();
  });
});
