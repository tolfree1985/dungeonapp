import { describe, expect, it } from "vitest";
import {
  ConsequenceLine,
  translateConsequences,
  translateLedgerOpportunities,
  translatePersistentFlags,
  translateTurnDeltas,
} from "../consequenceTranslator";

describe("consequence translator", () => {
  it("translates persistent flags", () => {
    const flags = {
      "scene.fire": true,
      "scene.fire.accelerant": true,
      "fabric.oiled": true,
      "crate.weakened": true,
      "container.crate_open": true,
    };
    const lines = translatePersistentFlags(flags);
    const texts = lines.map((line) => line.text);
    expect(texts).toContain("The chamber is burning fast.");
    expect(texts).toContain("Fabric is oil-soaked.");
    expect(texts).toContain("The crate is weakened.");
    expect(texts).toContain("The crate is open.");
  });

  it("translates pressure deltas", () => {
    const delta = translateTurnDeltas([
      { kind: "pressure.add", domain: "noise", amount: 1 },
      { kind: "pressure.add", domain: "time", amount: 1 },
      { kind: "pressure.add", domain: "danger", amount: 1 },
    ]);
    const texts = delta.map((line) => line.text);
    expect(texts).toEqual(expect.arrayContaining(["Noise increased.", "Time advanced.", "Danger rose."]));
  });

  it("extracts opportunity lines from ledger entries", () => {
    const ledger = [
      { effect: "Hidden clue uncovered" },
      { effect: "Crate pried open" },
      { effect: "Route unlocked" },
      { effect: "Evidence shows a heavy object moved" },
    ];
    const lines = translateLedgerOpportunities(ledger);
    const texts = lines.map((line) => line.text);
    expect(texts).toContain("A hidden clue was uncovered.");
    expect(texts).toContain("The crate can now be searched.");
    expect(texts).toContain("A new route is available.");
    expect(texts).toContain("You found signs something heavy was moved.");
  });

  it("translateConsequences aggregates all inputs", () => {
    const input = {
      stateFlags: {
        "scene.fire": true,
        "fabric.oiled": true,
      },
      stateDeltas: [{ kind: "pressure.add", domain: "noise", amount: 1 }],
      ledgerAdds: [{ effect: "Hidden clue" }],
    };
    const lines = translateConsequences(input);
    const texts = lines.map((line) => line.text);
    expect(texts).toEqual(
      expect.arrayContaining(["The chamber is on fire.", "Fabric is oil-soaked.", "Noise increased.", "A hidden clue was uncovered."])
    );
  });

  it("does not surface internal ledger phrases", () => {
    const input = {
      ledgerAdds: [{ effect: "inventory.chemical -> Oil spreads across the fabric" }],
    };
    const lines = translateConsequences(input);
    expect(lines).toHaveLength(0);
  });
});
