// @vitest-environment jsdom

import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NarrationBlock } from "@/components/play/NarrationBlock";

describe("NarrationBlock", () => {
  afterEach(() => cleanup());

  it("renders headline and lines deterministically", () => {
    const narration = {
      headline: "You succeed, but at a cost.",
      primaryLines: ["The door opens."],
      complicationLines: ["Complication: Guard notices."],
      costLines: ["Cost: You make noise."],
    };
    render(<NarrationBlock narration={narration} />);
    expect(screen.getByText("You succeed, but at a cost.")).toBeTruthy();
    expect(screen.getByText("The door opens.")).toBeTruthy();
    expect(screen.getByText("Complication: Guard notices.")).toBeTruthy();
    expect(screen.getByText("Cost: You make noise.")).toBeTruthy();
  });
});
