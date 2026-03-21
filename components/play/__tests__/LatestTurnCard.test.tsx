// @vitest-environment jsdom

import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import LatestTurnCard from "@/components/play/LatestTurnCard";
import { buildLatestTurnViewModel } from "@/components/play/presenters";
import type { PlayTurn } from "@/app/play/types";
import type { FinalizedEffectSummary } from "@/lib/finalized-effects";
import { buildFinalizedConsequenceNarration } from "@/server/scene/finalized-consequence-narration";

const watchfulnessSummary: FinalizedEffectSummary = "watchfulness.high";

function createWatchfulTurn(): PlayTurn {
  return {
    id: "turn-watchfulness",
    turnIndex: 1,
    playerInput: "LOOK",
    scene: "Dim corridor",
    resolution: "Observation complete",
    stateDeltas: [],
    ledgerAdds: [],
    createdAt: new Date().toISOString(),
    effectSummaries: [watchfulnessSummary],
    watchfulness: "high",
    watchfulnessCostDelta: 1,
    watchfulnessEffect: watchfulnessSummary,
    npcStance: "alerted",
  };
}

function createConsequenceTurn(): PlayTurn {
  const complicationEntries = [
    {
      id: "complication.applied",
      ledgerText: "Complication applied",
      kind: "complication" as const,
    },
    {
      id: "noise.escalation",
      ledgerText: "Noise rises",
      kind: "complication" as const,
      narrationText: "A guard reacts to the noise.",
    },
  ];
  const extraCostEntries = [
    {
      id: "extra-cost-1",
      ledgerText: "Extra cost 1",
      kind: "cost" as const,
    },
  ];
  return {
    ...createWatchfulTurn(),
    consequenceComplicationEntries: complicationEntries,
    consequenceExtraCostEntries: extraCostEntries,
    forcedComplicationCount: 2,
    outcomeSeverity: "harsh",
    effectSummaries: [watchfulnessSummary, "complication.applied" as FinalizedEffectSummary],
    consequenceNarration: buildFinalizedConsequenceNarration({
      outcomeSeverity: "harsh",
      consequenceComplicationEntries: complicationEntries,
      consequenceExtraCostEntries: extraCostEntries,
    }),
  };
}

describe("LatestTurnCard watchfulness smoke test", () => {
  afterEach(() => cleanup());

  it("preserves watchfulness, opportunity summaries, and NPC stance", () => {
    const viewModel = buildLatestTurnViewModel(createWatchfulTurn(), "calm");
    expect(viewModel.watchfulness).toBe("high");
    expect(viewModel.npcStance).toBe("alerted");
    expect(viewModel.effectSummaries).toContain(watchfulnessSummary);
  });

  it("renders the fixed watchfulness label from the finalized effect summary", () => {
    const viewModel = buildLatestTurnViewModel(createWatchfulTurn(), "calm");
    render(<LatestTurnCard model={viewModel} />);
    expect(screen.getByText("Watchfulness high")).toBeTruthy();
  });
});

describe("LatestTurnCard consequence bundle rendering", () => {
  afterEach(() => cleanup());

  it("renders the canonical consequence entries and severity/policy context", () => {
    const viewModel = buildLatestTurnViewModel(createConsequenceTurn(), "calm");
    render(<LatestTurnCard model={viewModel} />);
    expect(screen.getByTestId("severity-label").textContent).toContain("Severity: HARSH");
    expect(screen.getByTestId("policy-label").textContent).toContain("Forced complications: 2");
    expect(screen.getByTestId("consequence-complications").textContent).toContain("Complication applied");
    expect(screen.getByTestId("consequence-extra-costs").textContent).toContain("Extra cost 1");
  });

  it("keeps effect summaries supplemental alongside the bundle", () => {
    const viewModel = buildLatestTurnViewModel(createConsequenceTurn(), "calm");
    render(<LatestTurnCard model={viewModel} />);
    expect(screen.getByText("Watchfulness high")).toBeTruthy();
  });

  it("prefers persisted resolution presentation over legacy fields", () => {
    const turnWithPresentation: PlayTurn = {
      ...createWatchfulTurn(),
      resolution: "Failure recorded",
      resolutionJson: {
        outcome: "FAILURE",
        rollTotal: 4,
        dice: [2, 2],
        resultLabel: "Failure",
      },
      presentation: {
        resolution: {
          outcome: "SUCCESS_WITH_COST",
          rollLabel: "Roll: 2d6 → 8",
          resultLabel: "Success with Cost",
        },
        narration: {
          headline: "You get it done, but not without a price.",
          primaryLines: ["The gate opens."],
          complicationLines: [],
          costLines: ["Cost: You leave muddy tracks."],
        },
        ledgerEntries: [],
      },
    };
    const viewModel = buildLatestTurnViewModel(turnWithPresentation, "calm");
    render(<LatestTurnCard model={viewModel} />);
    expect(screen.queryByTestId("resolution-roll-label")).toBeNull();
    expect(screen.getByTestId("resolution-outcome-label").textContent).toContain("Success with Cost");
    const toggle = screen.getByRole("button", { name: /show details/i });
    fireEvent.click(toggle);
    const detailsRoll = screen.getByTestId("details-roll-info");
    expect(detailsRoll.textContent).toContain("Roll: 2d6 → 8");
    expect(detailsRoll.textContent).toContain("(2 + 2)");
    expect(screen.queryByText("Roll: 2d6 → 4")).toBeNull();
  });

  it("renders ledger entries with kind-aware styling and order", () => {
    const ledgerTurn: PlayTurn = {
      ...createWatchfulTurn(),
      presentation: {
        resolution: {
          outcome: "SUCCESS",
          rollLabel: "Roll: 2d6 → 6",
          resultLabel: "Success",
        },
        narration: null,
        ledgerEntries: [
          { id: "primary", kind: "primary", text: "Primary move" },
          { id: "complication", kind: "complication", text: "Complication triggered" },
          { id: "cost", kind: "cost", text: "Cost incurred" },
        ],
      },
    };
    const viewModel = buildLatestTurnViewModel(ledgerTurn, "calm");
    render(<LatestTurnCard model={viewModel} />);
    fireEvent.click(screen.getByRole("button", { name: /show details/i }));
    const ledgerItems = screen.getAllByTestId("consequence-ledger-entry");
    expect(ledgerItems.map(({ textContent }) => textContent)).toEqual([
      "Primary move",
      "Complication triggered",
      "Cost incurred",
    ]);
    expect(ledgerItems[0].className).toContain("bg-white/5");
    expect(ledgerItems[1].className).toContain("bg-amber-500/10");
    expect(ledgerItems[2].className).toContain("bg-rose-500/10");
  });
});
