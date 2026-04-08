import { describe, expect, it } from "vitest";
import { buildTurnChanges } from "../turnChangesTranslator";

describe("turn change translator", () => {
  it("reports fire spread when the fire flag is set", () => {
    const changes = buildTurnChanges({
      stateDeltas: [{ kind: "flag.set", key: "scene.fire", value: true }],
    });
    expect(changes).toEqual(expect.arrayContaining([expect.objectContaining({ label: "Fire spread" })]));
  });

  it("captures pressure increases for noise, danger, and time", () => {
    const changes = buildTurnChanges({
      stateDeltas: [
        { kind: "pressure.add", domain: "noise", amount: 1 },
        { kind: "pressure.add", domain: "danger", amount: 1 },
        { kind: "pressure.add", domain: "time", amount: 1 },
      ],
    });
    const labels = changes.map((change) => change.label);
    expect(labels).toEqual(expect.arrayContaining(["Noise increased", "Danger increased", "Time advanced"]));
  });

  it("reports crate state from ledger entries", () => {
    const changes = buildTurnChanges({
      ledger: [
        { effect: "Crate pried open" },
        { effect: "Crate weakened" },
      ],
    });
    const labels = changes.map((change) => change.label);
    expect(labels).toEqual(expect.arrayContaining(["Crate opened", "Crate weakened"]));
  });

  it("uses flag state for structural crate progress", () => {
    const changes = buildTurnChanges({
      stateDeltas: [
        { kind: "flag.set", key: "crate.weakened", value: true },
        { kind: "flag.set", key: "container.crate_open", value: true },
      ],
    });
    const labels = changes.map((change) => change.label);
    expect(labels).toEqual(expect.arrayContaining(["Crate weakened.", "Crate opened."]));
  });

  it("discovers clues and signs of movement from ledger narrative", () => {
    const changes = buildTurnChanges({
      ledger: [
        { effect: "Hidden clue uncovered" },
        { effect: "Evidence shows a heavy object moved" },
      ],
    });
    const labels = changes.map((change) => change.label);
    expect(labels).toEqual(expect.arrayContaining(["Clue uncovered", "Signs of movement found"]));
  });

  it("deduplicates identical labels", () => {
    const changes = buildTurnChanges({
      ledger: [
        { effect: "Hidden clue uncovered" },
        { effect: "Hidden clue uncovered" },
      ],
    });
    const clueEntries = changes.filter((change) => change.label === "Clue uncovered");
    expect(clueEntries).toHaveLength(1);
  });

  it("limits the list to the four highest-priority changes", () => {
    const changes = buildTurnChanges({
      stateDeltas: [
        { kind: "flag.set", key: "scene.fire", value: true },
        { kind: "flag.set", key: "fabric.oiled", value: true },
        { kind: "pressure.add", domain: "noise", amount: 1 },
      ],
      ledger: [
        { effect: "Crate pried open" },
        { effect: "Crate weakened" },
        { effect: "Hidden clue uncovered" },
        { effect: "Evidence shows a heavy object moved" },
        { effect: "Something else" },
      ],
    });
    expect(changes.length).toBeLessThanOrEqual(4);
  });
});
