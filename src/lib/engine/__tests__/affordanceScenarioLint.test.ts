import { describe, expect, it } from "vitest";
import { describeScenarioAffordanceCoverage, runAffordanceScenarioLint } from "../affordanceScenarioLint";

describe("affordance scenario lint", () => {
  it("respects mystery-docks exclusions while keeping lantern/oil/crate coverage", () => {
    const coverage = describeScenarioAffordanceCoverage().find((entry) => entry.scenarioId === "mystery-docks");
    expect(coverage).toBeDefined();
    expect(coverage?.supported).toEqual(
      expect.arrayContaining([
        "lit_lantern_ignites_fabric",
        "oil_spreads_fire",
        "crowbar_pries_crate",
        "crowbar_pries_weakened_crate",
        "crate_is_weakened",
      ]),
    );
    expect(coverage?.missingNouns).toHaveLength(0);
    expect(coverage?.missingItems).toHaveLength(0);
    expect(coverage?.excluded).toContain("rope_anchors_beam");

    const issues = runAffordanceScenarioLint();
    const ropeIssues = issues.filter((issue) => issue.ruleId === "rope_anchors_beam");
    expect(ropeIssues).toHaveLength(0);
  });
});
