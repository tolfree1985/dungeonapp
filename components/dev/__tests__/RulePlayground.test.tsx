// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import RulePlayground from "@/components/dev/RulePlayground";

afterEach(() => {
  cleanup();
});

describe("RulePlayground", () => {
  it("shows readable diagnostic and preview feedback", () => {
    render(<RulePlayground />);

    expect(screen.getByText("Rule Authoring Playground")).toBeTruthy();
    expect(screen.getByText("Diagnostics")).toBeTruthy();
    expect(screen.getAllByText(/This rule will shadow another due to FIRST_MATCH ordering\./).length).toBeGreaterThan(0);
    expect(screen.getByText("BLOCKED")).toBeTruthy();
  });

  it("applies the replace fix and clears the overlap warning", async () => {
    render(<RulePlayground />);

    fireEvent.click(screen.getAllByRole("button", { name: "Apply Fix" })[0]);

    await waitFor(() => {
      expect(screen.queryByText(/FIRST_MATCH ordering/)).toBeNull();
    });

    expect(screen.getByText("Fix Preview")).toBeTruthy();
    expect(screen.getByText(/blocked\[1\]\.replaces/)).toBeTruthy();
    expect(screen.getByDisplayValue(/"replaces": \[/)).toBeTruthy();
    expect(screen.queryByText(/No diagnostics surfaced\./)).toBeNull();
    expect(screen.getAllByText("BLOCKED").length).toBeGreaterThan(0);
  });
});
