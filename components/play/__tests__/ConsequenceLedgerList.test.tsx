// @vitest-environment jsdom

import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { ConsequenceLedgerList } from "@/components/play/ConsequenceLedgerList";
import type { LedgerPresentationEntry } from "@/server/scene/ledger-presentation";

describe("ConsequenceLedgerList", () => {
  afterEach(() => cleanup());

  it("toggles visibility and renders entries in order with kind-aware styling", () => {
    const entries: LedgerPresentationEntry[] = [
      { id: "primary", kind: "primary", text: "Primary move" },
      { id: "complication", kind: "complication", text: "Complication triggered" },
      { id: "cost", kind: "cost", text: "Cost incurred" },
    ];

    render(<ConsequenceLedgerList entries={entries} resolutionRollLabel="Roll: 2d6 → 6" rollDetail="Dice: 3 + 3" />);
    expect(screen.queryByTestId("consequence-ledger-entry")).toBeNull();
    const toggle = screen.getByRole("button", { name: /show details/i });
    fireEvent.click(toggle);
    const details = screen.getByTestId("details-roll-info");
    expect(details.textContent).toContain("Roll: 2d6 → 6");
    expect(details.textContent).toContain("(3 + 3)");
    const rendered = screen.getAllByTestId("consequence-ledger-entry");
    expect(toggle.textContent).toBe("Hide details");
    expect(rendered.map((node) => node.textContent)).toEqual([
      "Primary move",
      "Complication triggered",
      "Cost incurred",
    ]);
    expect(rendered[0].className).toContain("bg-white/5");
    expect(rendered[1].className).toContain("bg-amber-500/10");
    expect(rendered[2].className).toContain("bg-rose-500/10");
  });
});
