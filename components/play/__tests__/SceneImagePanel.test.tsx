// @vitest-environment jsdom

import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SceneImagePanel } from "@/components/play/SceneImagePanel";
import type { ResolvedSceneImage } from "@/lib/sceneArt";

const baseImage: ResolvedSceneImage = {
  imageUrl: "/default.png",
  source: "default",
  pending: false,
};

describe("SceneImagePanel", () => {
  it("renders the supplied transition cue", () => {
    render(<SceneImagePanel {...baseImage} transitionCue="Focus Shift" />);
    expect(screen.getByText("Focus Shift")).toBeTruthy();
  });

  it("hides the cue when none is provided", () => {
    render(<SceneImagePanel {...baseImage} />);
    expect(screen.queryByText("Camera Push-In")).toBeNull();
  });
});
