// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ScenarioStartButton from "@/components/scenarios/ScenarioStartButton";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ScenarioStartButton", () => {
  it("posts the scenario id to the canonical create route", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ adventureId: "adv_new" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(window, "location", {
      value: { href: "" },
      writable: true,
    });

    render(<ScenarioStartButton scenarioId="dungeon-expedition-seed" />);
    fireEvent.click(screen.getByRole("button", { name: "Start New Run" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/adventures/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenarioId: "dungeon-expedition-seed" }),
      });
    });
  });
});
