// @vitest-environment jsdom

import React from "react";
import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SceneImagePanel } from "@/components/play/SceneImagePanel";
import type { ResolvedSceneImage } from "@/lib/sceneArt";

const baseImage: ResolvedSceneImage = {
  imageUrl: "/default.png",
  source: "default",
  pending: false,
  sceneKey: null,
  status: "missing",
};

describe("SceneImagePanel", () => {
  afterEach(() => cleanup());
  it("renders the supplied transition cue", () => {
    render(<SceneImagePanel {...baseImage} transitionCue="Focus Shift" />);
    expect(screen.getByText("Focus Shift")).toBeTruthy();
  });

  it("hides the cue when none is provided", () => {
    render(<SceneImagePanel {...baseImage} />);
    expect(screen.queryByText("Camera Push-In")).toBeNull();
  });

  it("renders the pending placeholder when a render is queued", () => {
    render(<SceneImagePanel {...baseImage} imageUrl={null} sceneArtStatus="generating" pending />);
    const placeholder = screen.getByText("Rendering scene...", { selector: ".scene-placeholder" });
    expect(placeholder).toBeTruthy();
    expect(screen.queryByText("Using fallback scene")).toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
    expect(placeholder.className).toContain("scene-placeholder");
  });

  it("renders fallback messaging for the default source", () => {
    render(
      <SceneImagePanel
        {...baseImage}
        imageUrl={null}
        pending={false}
        source="default"
        status="missing"
        sceneArtStatus="missing"
      />
    );
    expect(screen.getByText("Scene art artifact missing")).toBeTruthy();
    expect(screen.getByText("Scene art missing")).toBeTruthy();
  });

  it("shows retry and force buttons for missing", () => {
    render(
      <SceneImagePanel
        {...baseImage}
        imageUrl={null}
        pending={false}
        source="default"
        status="missing"
        sceneArtStatus="missing"
        retrySceneKey="dock_office"
        retrySceneText="text"
      />
    );
    expect(screen.getByText("Retry render")).toBeTruthy();
    expect(screen.getByText("Force regenerate")).toBeTruthy();
  });

  it("hides force button for pending", () => {
    render(
      <SceneImagePanel
        {...baseImage}
        pending
        sceneArtStatus="generating"
        status="missing"
        retrySceneKey="dock_office"
        retrySceneText="text"
      />
    );
    expect(screen.queryByText("Force regenerate")).toBeNull();
  });

  it("shows only force button for ready", () => {
    render(
      <SceneImagePanel
        {...baseImage}
        status="ready"
        sceneArtStatus="ready"
        imageUrl="/scene.png"
        source="scene"
        retrySceneKey="dock_office"
        retrySceneText="text"
      />
    );
    expect(screen.queryByText("Retry render")).toBeNull();
    expect(screen.getByText("Force regenerate")).toBeTruthy();
  });

  it("renders the image when imageUrl is present", () => {
    render(<SceneImagePanel {...baseImage} imageUrl="/scene.png" source="scene" status="ready" />);
    expect(screen.getByRole("img").getAttribute("src")).toBe("/scene.png");
  });
});
