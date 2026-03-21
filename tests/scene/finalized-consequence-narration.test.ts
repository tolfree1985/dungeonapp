import { describe, expect, it } from "vitest";
import { buildFinalizedConsequenceNarration, flattenNarrationLines } from "@/server/scene/finalized-consequence-narration";
import { expectDeterministicNarration } from "./helpers/deterministic-narration";

describe("buildFinalizedConsequenceNarration", () => {
  it("returns a calm headline when there are no complications", () => {
    const narration = buildFinalizedConsequenceNarration({
      outcomeSeverity: "normal",
      consequenceComplicationEntries: [],
      consequenceExtraCostEntries: [],
    });
    expect(narration.headline).toBe("The aftermath stays calm.");
    expect(narration.complicationLines).toEqual([]);
    expect(narration.costLines).toEqual([]);
    expect(narration.primaryLines).toEqual([]);
  });

  it("describes a strained situation with one complication", () => {
    const narration = buildFinalizedConsequenceNarration({
      outcomeSeverity: "strained",
      consequenceComplicationEntries: [
        { id: "npc.suspicion", ledgerText: "NPC suspicion increases." },
      ],
      consequenceExtraCostEntries: [
        { id: "extra-cost-1", ledgerText: "You pay an extra cost." },
      ],
    });
    expect(narration.headline).toBe("The situation tightens.");
    expect(narration.complicationLines).toEqual(["NPC suspicion increases."]);
    expect(narration.costLines).toEqual(["You pay an extra cost."]);
    expect(flattenNarrationLines(narration).join(" ")).not.toMatch(/complication|danger escalates/i);
  });

  it("builds a harsh output for stacked consequences", () => {
    const narration = buildFinalizedConsequenceNarration({
      outcomeSeverity: "harsh",
      consequenceComplicationEntries: [
        { id: "noise.escalation", ledgerText: "Noise rises, drawing attention." },
        { id: "position.penalty", ledgerText: "Your position weakens." },
      ],
      consequenceExtraCostEntries: [
        { id: "extra-cost-2", ledgerText: "Costs mount rapidly." },
      ],
    });
    expect(narration.headline).toBe("The world reels under pressure.");
    expect(narration.complicationLines).toEqual([
      "Noise rises, drawing attention.",
      "Your position weakens.",
    ]);
    expect(narration.costLines).toEqual(["Costs mount rapidly."]); 
  });

  it("is deterministic for identical inputs", () => {
    const entry = { id: "npc.suspicion", ledgerText: "NPC suspicion increases." };
    const costEntry = { id: "extra-cost-1", ledgerText: "You pay an extra cost." };
    const input = {
      outcomeSeverity: "strained" as const,
      consequenceComplicationEntries: [entry],
      consequenceExtraCostEntries: [costEntry],
    };
    const first = buildFinalizedConsequenceNarration(input);
    const second = buildFinalizedConsequenceNarration(input);
    expectDeterministicNarration({ consequenceNarration: first }, { consequenceNarration: second });
  });

  it("prefers authored narration text", () => {
    const authoredEntry = {
      id: "custom.line",
      ledgerText: "world.alert = true",
      narrationText: "The guard snaps to attention.",
    };
    const narration = buildFinalizedConsequenceNarration({
      outcomeSeverity: "normal",
      consequenceComplicationEntries: [authoredEntry],
      consequenceExtraCostEntries: [],
    });
    expect(narration.complicationLines).toEqual(["The guard snaps to attention."]);
  });

  it("falls back to raw text when narrationText is absent", () => {
    const entry = { id: "action", ledgerText: "Player leans in." };
    const narration = buildFinalizedConsequenceNarration({
      outcomeSeverity: "normal",
      consequenceComplicationEntries: [entry],
      consequenceExtraCostEntries: [],
    });
    expect(narration.complicationLines).toEqual(["Player leans in."]);
  });

  it("orders lines consistently per canonical sections", () => {
    const narration = buildFinalizedConsequenceNarration({
      outcomeSeverity: "strained",
      consequenceComplicationEntries: [{ id: "position.penalty", ledgerText: "Your position weakens." }],
      consequenceExtraCostEntries: [{ id: "extra-cost-1", ledgerText: "You pay an extra cost." }],
    });
    expect(flattenNarrationLines(narration)).toEqual([
      "Your position weakens.",
      "You pay an extra cost.",
    ]);
  });
});
