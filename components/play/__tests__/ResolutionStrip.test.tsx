// @vitest-environment jsdom

import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ResolutionStrip } from "@/components/play/ResolutionStrip";
import type { TurnResolutionPresentation } from "@/server/scene/turn-resolution-presentation";

describe("ResolutionStrip", () => {
  afterEach(() => cleanup());

  it("renders only the outcome label", () => {
    const resolution: TurnResolutionPresentation = {
      outcome: "SUCCESS_WITH_COST",
      rollLabel: "Roll: 2d6 → 7",
      resultLabel: "Success with cost",
    };
    render(<ResolutionStrip resolution={resolution} pressureStage="danger" />);
    expect(screen.getByTestId("resolution-outcome-label").textContent).toBe("Success with cost");
    expect(screen.queryByTestId("resolution-roll-label")).toBeNull();
    expect(screen.queryByTestId("resolution-result-label")).toBeNull();
    expect(screen.queryByText("(3 + 4)")).toBeNull();
  });
});
