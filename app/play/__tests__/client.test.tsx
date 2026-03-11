// @vitest-environment jsdom

import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import PlayClient from "@/app/play/client";
import type { PlayStatePanel } from "@/app/play/types";

vi.mock("@/components/play/LatestTurnCard", () => ({
  default: ({ turn }: { turn: { id: string } }) => <div>LatestTurnCard:{turn.id}</div>,
}));

vi.mock("@/components/play/StatePanel", () => ({
  default: ({ state }: { state: PlayStatePanel }) => <div>StatePanel:{state.stats.length}</div>,
}));

vi.mock("@/components/play/TurnInput", () => ({
  default: ({ adventureId }: { adventureId: string }) => <div>TurnInput:{adventureId}</div>,
}));

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

beforeEach(() => {
  window.localStorage.clear();
});

describe("PlayClient", () => {
  it("groups current, pinned, and recent adventures without duplicates", async () => {
    window.localStorage.setItem(
      "creator:recentAdventures",
      JSON.stringify([
        { adventureId: "adv-current", scenarioId: "sc-current", timestamp: 3, pinned: true },
        { adventureId: "adv-pinned", scenarioId: "sc-pinned", timestamp: 2, pinned: true },
        { adventureId: "adv-recent", scenarioId: "sc-recent", timestamp: 1, pinned: false },
      ])
    );

    render(
      <PlayClient
        adventureId="adv-current"
        scenarioId="sc-current"
        turns={[]}
        statePanel={{ stats: [], inventory: [], quests: [], relationships: [] }}
        currentScenario={{ id: "sc-current", title: "Current Scenario", summary: "Opening at the breach" }}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Adventure tools")).toBeTruthy();
    });

    expect(screen.getAllByText("Current Scenario").length).toBeGreaterThan(0);
    expect(screen.getByText("Pinned")).toBeTruthy();
    expect(screen.getByText("Recent")).toBeTruthy();
    expect(screen.getByText("adv-pinned")).toBeTruthy();
    expect(screen.getByText("adv-recent")).toBeTruthy();
    expect(screen.queryByText("No pinned adventures.")).toBeNull();

    const pinnedSection = screen.getByText("Pinned").parentElement;
    expect(within(pinnedSection as HTMLElement).queryByText("adv-current")).toBeNull();
  });

  it("renders unknown scenario fallback safely", async () => {
    window.localStorage.setItem(
      "creator:recentAdventures",
      JSON.stringify([{ adventureId: "adv-current", scenarioId: "sc-missing", timestamp: 3, pinned: false }])
    );

    render(
      <PlayClient
        adventureId="adv-current"
        scenarioId="sc-missing"
        turns={[]}
        statePanel={{ stats: [], inventory: [], quests: [], relationships: [] }}
        currentScenario={null}
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText("Unknown scenario").length).toBeGreaterThan(0);
    });
  });
});
