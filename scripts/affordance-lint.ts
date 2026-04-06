import {
  describeScenarioAffordanceCoverage,
  runAffordanceScenarioLint,
  type AffordanceLintIssue,
} from "../src/lib/engine/affordanceScenarioLint";
import { runAffordanceRegistryLint } from "../src/lib/engine/inventory/affordanceRegistry";

const RULE_COVERAGE_LABELS: Record<string, string> = {
  lit_lantern_ignites_fabric: "lantern/fire",
  lit_lantern_ignites_oiled_fabric: "lantern/fire",
  oil_spreads_fire: "oil/fire",
  crowbar_pries_crate: "crate/crowbar",
  crowbar_pries_weakened_crate: "crate/crowbar",
  crate_is_weakened: "crate/crowbar",
  rope_anchors_beam: "rope/beam",
};

function formatCoverage(ruleIds: string[]): string {
  const labels = Array.from(
    new Set(
      ruleIds
        .map((ruleId) => RULE_COVERAGE_LABELS[ruleId] ?? ruleId)
        .filter(Boolean),
    ),
  );
  return labels.length ? labels.join(", ") : "none";
}

async function main() {
  const registryIssues = runAffordanceRegistryLint();
  const scenarioIssues = runAffordanceScenarioLint();

  console.log("Affordance registry issues:");
  registryIssues.forEach((issue) => console.log(`${issue.level.toUpperCase()}: ${issue.message}`));

  console.log("Scenario affordance issues:");
  scenarioIssues.forEach((issue) =>
    console.log(`${issue.level.toUpperCase()}: [${issue.scenarioId}] ${issue.ruleId}: ${issue.message}`),
  );

  console.log("Affordance coverage:");
  const coverage = describeScenarioAffordanceCoverage();
  coverage.forEach((entry) => {
    console.log(entry.scenarioId);
    console.log(`  supported: ${formatCoverage(entry.supported)}`);
    console.log(`  excluded: ${formatCoverage(entry.excluded)}`);
  });

  const hasError = registryIssues.some((issue) => issue.level === "error");
  process.exit(hasError ? 1 : 0);
}

main().catch((err) => {
  console.error("Affordance lint failed", err);
  process.exit(1);
});
