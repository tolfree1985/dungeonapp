import { describe, expect, it } from "vitest";
import { buildConsequenceBundle, type ConsequenceEntry, type ConsequenceKind } from "@/server/scene/consequence-bundle";
import { assertConsequenceEntryKind } from "@/server/scene/assert-consequence-entry-kind";

describe("buildConsequenceBundle", () => {
  it("marks extra cost entries as cost kind", () => {
    const bundle = buildConsequenceBundle({
      forcedComplicationCount: 0,
      outcomeSeverity: "normal",
      consequenceBudgetExtraCostCount: 2,
    });
    expect(bundle.extraCostEntries.every((entry) => entry.kind === "cost")).toBe(true);
  });

  it("keeps ledger text separate from narration text", () => {
    const customEntry: ConsequenceEntry = {
      id: "custom-entry",
      kind: "primary",
      ledgerText: "Gate opens",
      narrationText: "The gate groans open.",
    };
    const narrationLine = customEntry.narrationText ?? customEntry.ledgerText;
    expect(narrationLine).toBe("The gate groans open.");
    expect(customEntry.ledgerText).toBe("Gate opens");
  });

  it("asserts consequence entry kind matches expectation", () => {
    const costEntry: ConsequenceEntry = {
      id: "extra-cost-x",
      kind: "cost",
      ledgerText: "Lose 1 supply",
    };
    expect(() => assertConsequenceEntryKind(costEntry, "cost")).not.toThrow();
    expect(() => assertConsequenceEntryKind(costEntry, "primary" as ConsequenceKind)).toThrow();
  });
});
