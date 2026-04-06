// @vitest-environment jsdom

import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import LatestTurnCard from "@/components/play/LatestTurnCard";
import { buildLatestTurnViewModel } from "@/components/play/presenters";
import type { PlayTurn } from "@/app/play/types";

function baseTurn(overrides: Partial<PlayTurn> = {}): PlayTurn {
  return {
    id: "turn-1",
    turnIndex: 1,
    playerInput: "DO something",
    scene: "Dim corridor",
    resolution: "Result",
    stateDeltas: [],
    ledgerAdds: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("LatestTurnCard consequence presentation", () => {
  afterEach(() => cleanup());

  it("renders persistent and this-turn consequences separately", () => {
    const turn = baseTurn({
      stateFlags: {
        "scene.fire": true,
        "fabric.oiled": true,
        "container.crate_open": true,
      },
      stateDeltas: [
        { kind: "pressure.add", domain: "noise", amount: 1 },
        { kind: "pressure.add", domain: "time", amount: 1 },
      ],
      entityId: "tick",
    });
    const viewModel = buildLatestTurnViewModel(turn, "calm");
    render(<LatestTurnCard model={viewModel} />);

    expect(screen.getByText("Persistent")).toBeTruthy();
    expect(screen.getByText("The chamber is on fire.")).toBeTruthy();
    expect(screen.getByText("Fabric is oil-soaked.")).toBeTruthy();
    expect(screen.getByText("The crate is open.")).toBeTruthy();

    expect(screen.getByText("This Turn")).toBeTruthy();
    expect(screen.getByText(/Noise increased\.?/i)).toBeTruthy();
    expect(screen.getByText(/Time advanced\.?/i)).toBeTruthy();
    expect(screen.queryByText(/No immediate consequences detected/i)).toBeNull();
  });

  it("filters internal/legacy consequence lines", () => {
    const turn = baseTurn({
      consequenceNarration: {
        lines: [
          "Your position is less concealed",
          "A scrape in the wood suggests the frame was forced recently.",
          "Dust patterns show something heavy was moved.",
          "inventory.chemical → Oil spreads across the fabric",
          "action → Partial access gained (mixed)",
        ],
      },
    });
    const viewModel = buildLatestTurnViewModel(turn, "calm");
    render(<LatestTurnCard model={viewModel} />);

    expect(screen.queryByText(/your position is less concealed/i)).toBeNull();
    expect(screen.queryByText(/scrape in the wood/i)).toBeNull();
    expect(screen.queryByText(/dust patterns show/i)).toBeNull();
    expect(screen.queryByText(/inventory\.chemical/i)).toBeNull();
    expect(screen.queryByText(/partial access gained/i)).toBeNull();
  });

  it("shows accelerant fire narration from state flags", () => {
    const turn = baseTurn({
      stateFlags: {
        "scene.fire": true,
        "scene.fire.accelerant": true,
      },
    });
    const viewModel = buildLatestTurnViewModel(turn, "calm");
    expect(viewModel.fireNarrationLine?.toLowerCase()).toContain("accelerant");
  });

  it("shows fallback text when no consequences exist", () => {
    const turn = baseTurn({ stateDeltas: [], stateFlags: null });
    const viewModel = buildLatestTurnViewModel(turn, "calm");
    render(<LatestTurnCard model={viewModel} />);
    expect(screen.getByText(/no immediate consequences detected/i)).toBeTruthy();
  });
});
