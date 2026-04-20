// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import StatePanel from "@/components/play/StatePanel";
import { buildStatePanelViewModel } from "@/components/play/presenters";
import { deriveMechanicFacts, type MechanicFacts } from "@/lib/engine/presentation/mechanicFacts";

function emptyMechanicFacts(): MechanicFacts {
  return {
    achieved: [],
    costs: [],
    turnChanges: [],
    persistent: [],
    careNow: [],
    world: [],
    opportunities: [],
  };
}

afterEach(() => {
  cleanup();
});

describe("StatePanel diagnostics", () => {
  it("keeps scenario diagnostics out of the player-facing panel", () => {
    const viewModel = buildStatePanelViewModel(
      {
        stats: [],
        inventory: [],
        quests: [],
        relationships: [],
        opportunityWindow: {
          type: "shadow_hide",
          source: "environment.shadow",
          createdAtTurn: 3,
          consumableOnTurn: 4,
          expiresAtTurn: 4,
          expiresAt: 12,
          conditions: { ruleId: "SHADOW_HIDE_OPPORTUNITY" },
          status: "active",
          createdTurnIndex: 3,
        },
        summary: emptyMechanicFacts(),
      },
      [],
      emptyMechanicFacts(),
      {
        scenarioDiagnostics: [
          {
            type: "overlap",
            ruleId: "MOVE_BLOCKED_GENERIC",
            relatedRuleId: "MOVE_BLOCKED_BY_COLLAPSED_PASSAGE",
            message: "Rule MOVE_BLOCKED_GENERIC overlaps with MOVE_BLOCKED_BY_COLLAPSED_PASSAGE. This rule will shadow another due to FIRST_MATCH ordering.",
            severity: "warning",
            suggestion: "Narrow the conditions or use 'replaces' to explicitly override the broader rule.",
          },
        ],
      },
    );

    render(<StatePanel viewModel={viewModel} />);

    expect(screen.queryByText("Rule Diagnostics")).toBeNull();
    expect(screen.queryByText("Rule MOVE_BLOCKED_GENERIC overlaps with MOVE_BLOCKED_BY_COLLAPSED_PASSAGE. This rule will shadow another due to FIRST_MATCH ordering.")).toBeNull();
    expect(screen.queryByText("MOVE_BLOCKED_GENERIC")).toBeNull();
    expect(screen.queryByText("Narrow the conditions or use 'replaces' to explicitly override the broader rule.")).toBeNull();
  });

  it("renders readable opportunity facts instead of raw window fields", () => {
    const summary =
      deriveMechanicFacts({
        stateFlags: {},
        stateDeltas: [],
        ledgerAdds: [],
        stats: {},
        opportunityWindow: {
          type: "shadow_hide",
          source: "environment.shadow",
          quality: "clean",
          createdAtTurn: 3,
          consumableOnTurn: 4,
          expiresAtTurn: 4,
          expiresAt: 12,
          conditions: { ruleId: "SHADOW_HIDE_OPPORTUNITY" },
          status: "active",
          createdTurnIndex: 3,
        },
      }) ?? emptyMechanicFacts();
    const viewModel = buildStatePanelViewModel(
      {
        stats: [],
        inventory: [],
        quests: [],
        relationships: [],
        opportunityWindow: {
          type: "shadow_hide",
          source: "environment.shadow",
          createdAtTurn: 3,
          consumableOnTurn: 4,
          expiresAtTurn: 4,
          expiresAt: 12,
          conditions: { ruleId: "SHADOW_HIDE_OPPORTUNITY" },
          status: "active",
          createdTurnIndex: 3,
        },
        summary,
      },
      [],
      summary,
      {},
    );

    render(<StatePanel viewModel={viewModel} />);

    const opportunityCard = screen.getByText("Strike from cover").closest("article");
    expect(opportunityCard).toBeTruthy();
    const scoped = within(opportunityCard as HTMLElement);
    expect(scoped.getByText("Strike from cover")).toBeTruthy();
    expect(scoped.getByText("Strike from cover.")).toBeTruthy();
    expect(scoped.getByText("Strong advantage")).toBeTruthy();
    expect(scoped.getByText("Lost if unused")).toBeTruthy();
  });

  it("caps opportunities at two and highlights the best response for the dominant risk", () => {
    const baseViewModel = buildStatePanelViewModel(
      {
        stats: [],
        inventory: [],
        quests: [],
        relationships: [],
        opportunityWindow: null,
        summary: emptyMechanicFacts(),
      },
      [],
      emptyMechanicFacts(),
      {},
    );
    const viewModel = {
      ...baseViewModel,
      environmentHazards: {
        fire: null,
      },
      summary: {
        ...emptyMechanicFacts(),
        careNow: [
          { id: "exposure", key: "exposure_risk", text: "Your position is exposed.", bucket: "careNow", priority: 950 },
        ],
        opportunityFacts: [
          {
            id: "break",
            key: "break_line_of_sight",
            label: "Break line of sight",
            description: "Break line of sight.",
            availability: "now",
            strength: "strong",
            expires: "end_of_turn",
          },
          {
            id: "ignite",
            key: "ignite_oil",
            label: "Ignite the oil",
            description: "Ignite the oil.",
            availability: "now",
            strength: "strong",
            expires: "end_of_turn",
          },
          {
            id: "move",
            key: "move_now",
            label: "Move now",
            description: "Move now.",
            availability: "now",
            strength: "strong",
            expires: "end_of_turn",
          },
        ],
      },
    };

    render(<StatePanel viewModel={viewModel} />);

    const scoped = within(screen.getByTestId("opportunities-panel"));
    const cards = scoped.getAllByRole("article");
    expect(cards).toHaveLength(2);
    expect(within(cards[0]).getByText("Best response")).toBeTruthy();
    expect(within(cards[0]).getByText("Break line of sight")).toBeTruthy();
    expect(scoped.queryByText("Move now")).toBeNull();
  });

  it("pressure counters are always visible when pressure state exists", () => {
    const baseViewModel = buildStatePanelViewModel(
      {
        stats: [],
        inventory: [],
        quests: [],
        relationships: [],
        opportunityWindow: null,
        summary: emptyMechanicFacts(),
      },
      [],
      emptyMechanicFacts(),
      {},
    );

    render(
      <StatePanel
        viewModel={{
          ...baseViewModel,
          pressureTotals: {
            danger: 2,
            noise: 3,
            suspicion: 0,
            time: 3,
          },
          pressureRows: [
            { key: "danger", label: "Danger", value: 2, hint: "Escalating" },
            { key: "noise", label: "Noise", value: 3, hint: "Close to alert threshold" },
            { key: "suspicion", label: "Suspicion", value: 0, hint: "Low" },
            { key: "time", label: "Time", value: 3, hint: "Narrowing options" },
          ],
        }}
      />,
    );

    const scoped = within(screen.getByTestId("pressure-panel"));
    expect(scoped.getByText("Danger")).toBeTruthy();
    expect(scoped.getByText("Noise")).toBeTruthy();
    expect(scoped.getByText("Suspicion")).toBeTruthy();
    expect(scoped.getByText("Time")).toBeTruthy();
    expect(scoped.getAllByText("0")).toHaveLength(1);
    expect(scoped.getAllByText("2")).toHaveLength(1);
    expect(scoped.getAllByText("3")).toHaveLength(2);
    expect(scoped.getByText("Escalating")).toBeTruthy();
    expect(scoped.getByText("Close to alert threshold")).toBeTruthy();
    expect(scoped.getByText("Low")).toBeTruthy();
    expect(scoped.getByText("Narrowing options")).toBeTruthy();
  });

  it("renders care signals in priority order without a nested dominant card", () => {
    const baseViewModel = buildStatePanelViewModel(
      {
        stats: [],
        inventory: [],
        quests: [],
        relationships: [],
        opportunityWindow: null,
      },
      [],
      emptyMechanicFacts(),
      {},
    );
    const viewModel = {
      ...baseViewModel,
      summary: {
        ...emptyMechanicFacts(),
        careNow: [
          { id: "exposure", key: "exposure_risk", text: "Your position is exposed.", bucket: "careNow", priority: 800 },
          { id: "alert", key: "alert_state", text: "Enemies are on alert.", bucket: "careNow", priority: 700 },
        ],
      },
    };

    render(<StatePanel viewModel={viewModel} />);

    const scoped = within(screen.getByTestId("care-now-panel"));
    expect(scoped.queryByTestId("dominant-care-signal")).toBeNull();
    const items = scoped.getAllByRole("article");
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText("Your position is exposed.")).toBeTruthy();
    expect(within(items[1]).getByText("Enemies are on alert.")).toBeTruthy();
  });

  it("softens lower-priority care signals after the top three", () => {
    const baseViewModel = buildStatePanelViewModel(
      {
        stats: [],
        inventory: [],
        quests: [],
        relationships: [],
        opportunityWindow: null,
      },
      [],
      emptyMechanicFacts(),
      {},
    );
    const viewModel = {
      ...baseViewModel,
      summary: {
        ...emptyMechanicFacts(),
        careNow: [
          { id: "fire", key: "fire_active", text: "Flames are spreading.", bucket: "careNow", priority: 1000 },
          { id: "exposure", key: "exposure_risk", text: "Your position is exposed.", bucket: "careNow", priority: 950 },
          { id: "search", key: "search_active", text: "Enemies are searching.", bucket: "careNow", priority: 850 },
          { id: "noise", key: "noise_state", text: "Noise is rising.", bucket: "careNow", priority: 500 },
        ],
      },
    };

    render(<StatePanel viewModel={viewModel} />);

    const scoped = within(screen.getByTestId("care-now-panel"));
    expect(scoped.getByText("Flames are spreading.")).toBeTruthy();
    expect(scoped.getByText("Your position is exposed.")).toBeTruthy();
    expect(scoped.getByText("Enemies are searching.")).toBeTruthy();
    expect(scoped.queryByText("Noise is rising.")).toBeNull();
  });

  it("shows the latest turn ledger entries inline before the full ledger disclosure", () => {
    const baseViewModel = buildStatePanelViewModel(
      {
        stats: [],
        inventory: [],
        quests: [],
        relationships: [],
        opportunityWindow: null,
        summary: emptyMechanicFacts(),
      },
      [],
      emptyMechanicFacts(),
      {},
    );

    render(
      <StatePanel
        viewModel={{
          ...baseViewModel,
          latestTurnLedgerAdds: [
            "delay → The pause buys clarity, but the world uses the same time to tighten.",
            "threat.noise_peak → Guard is alerted",
            "searching + high noise → Player is revealed",
            "reaction.investigation.queued → An investigation is forming near room_start.",
            "flag.status.exposed → Your position is exposed.",
            "flag.action.constraint_pressure → pressure rising",
            "flag.guard.searching → Guard begins searching",
          ],
        }}
      />,
    );

    const scoped = within(screen.getByText("Causal Ledger").closest("section") as HTMLElement);
    const preview = scoped.getByTestId("ledger-preview");
    expect(within(preview).getByText("delay → guards alerted → your position is exposed → search begins")).toBeTruthy();
    expect(
      within(preview).getByText("The pause buys clarity, but the world uses the same time to tighten."),
    ).toBeTruthy();
    expect(within(preview).queryByText("threat.noise_peak")).toBeNull();
    expect(within(preview).queryByText("flag.status.exposed")).toBeNull();
    expect(within(preview).queryByText("pressure rising")).toBeNull();
    expect(within(preview).queryByText("An investigation is forming near room_start.")).toBeNull();
    expect(within(preview).queryByText("searching + high noise")).toBeNull();
    expect(scoped.getByText("View full ledger →")).toBeTruthy();
  });
});
