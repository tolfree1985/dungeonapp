import fs from "node:fs";
import path from "node:path";

export type AffordanceLintIssue = {
  level: "warning" | "error";
  ruleId: string;
  scenarioId: string;
  message: string;
};

export type ScenarioCoverage = {
  scenarioId: string;
  supported: string[];
  missingNouns: string[];
  missingItems: string[];
  excluded: string[];
};

const RULE_REQUIREMENTS: Array<{
  ruleId: string;
  nouns: string[];
  itemKey?: string;
}> = [
  { ruleId: "lit_lantern_ignites_fabric", nouns: ["tapestry", "drapes", "fabric", "banner"], itemKey: "iron_lantern" },
  { ruleId: "oil_spreads_fire", nouns: ["tapestry", "fabric", "oil"], itemKey: "oil_vial" },
  { ruleId: "crowbar_pries_crate", nouns: ["crate", "box", "chest"], itemKey: "crowbar" },
  { ruleId: "crowbar_pries_weakened_crate", nouns: ["crate"], itemKey: "crowbar" },
  { ruleId: "crate_is_weakened", nouns: ["crate"], itemKey: "crowbar" },
  { ruleId: "rope_anchors_beam", nouns: ["beam", "rafter"], itemKey: "rope" },
];

function collectScenarioText(scenario: Record<string, unknown>): string {
  return JSON.stringify(scenario, null, 0).toLowerCase();
}

function hasItem(scenario: Record<string, unknown>, key: string): boolean {
  const inventory = scenario.initialState?.inventory;
  if (!Array.isArray(inventory)) return false;
  return inventory.some((entry: any) => entry?.key === key);
}

function getAffordanceExclusions(scenario: Record<string, unknown>): string[] {
  const raw = scenario.affordanceExclusions;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((value) => (typeof value === "string" ? value.trim() : String(value).trim()))
    .filter((value) => value.length > 0);
}

function isRuleExcluded(ruleId: string, exclusions: Set<string>): boolean {
  const normalizedRuleId = ruleId.toLowerCase();
  if (exclusions.has(normalizedRuleId)) return true;
  const family = normalizedRuleId.split("_")[0];
  return exclusions.has(family);
}

function analyzeScenario(scenario: Record<string, unknown>): ScenarioCoverage {
  const scenarioId = (scenario.id as string) ?? "unknown";
  const text = collectScenarioText(scenario);
  const supported: string[] = [];
  const missingNouns: string[] = [];
  const missingItems: string[] = [];
  const exclusionList = getAffordanceExclusions(scenario);
  const normalizedExclusions = new Set(exclusionList.map((entry) => entry.toLowerCase()));
  for (const requirement of RULE_REQUIREMENTS) {
    if (isRuleExcluded(requirement.ruleId, normalizedExclusions)) {
      continue;
    }
    const nounsPresent = requirement.nouns.some((noun) => text.includes(noun));
    const itemPresent = requirement.itemKey ? hasItem(scenario, requirement.itemKey) : true;
    if (nounsPresent && itemPresent) {
      supported.push(requirement.ruleId);
    } else {
      if (!nounsPresent) missingNouns.push(requirement.ruleId);
      if (requirement.itemKey && !itemPresent) missingItems.push(requirement.ruleId);
    }
  }
  return { scenarioId, supported, missingNouns, missingItems, excluded: exclusionList };
}

export function runAffordanceScenarioLint(): AffordanceLintIssue[] {
  const scenarioDir = path.join(process.cwd(), "scenarios");
  if (!fs.existsSync(scenarioDir)) return [];
  const issues: AffordanceLintIssue[] = [];
  for (const file of fs.readdirSync(scenarioDir).filter((name) => name.endsWith(".json"))) {
    const fullPath = path.join(scenarioDir, file);
    const raw = fs.readFileSync(fullPath, "utf-8");
    const scenario = JSON.parse(raw) as Record<string, unknown>;
    const scenarioId = (scenario.id as string) ?? file;
    const text = collectScenarioText(scenario);
    const exclusionList = getAffordanceExclusions(scenario);
    const normalizedExclusions = new Set(exclusionList.map((entry) => entry.toLowerCase()));
    for (const requirement of RULE_REQUIREMENTS) {
      if (isRuleExcluded(requirement.ruleId, normalizedExclusions)) {
        continue;
      }
      const matchesNoun = requirement.nouns.some((noun) => text.includes(noun));
      if (!matchesNoun) {
        issues.push({
          level: "warning",
          ruleId: requirement.ruleId,
          scenarioId,
          message: `Scenario lacks expected nouns ${requirement.nouns.join(", ")} for rule ${requirement.ruleId}`,
        });
      }
      if (requirement.itemKey && !hasItem(scenario, requirement.itemKey)) {
        issues.push({
          level: "warning",
          ruleId: requirement.ruleId,
          scenarioId,
          message: `Scenario inventory does not include ${requirement.itemKey} used by ${requirement.ruleId}`,
        });
      }
    }
  }
  return issues;
}

export function describeScenarioAffordanceCoverage(): ScenarioCoverage[] {
  const scenarioDir = path.join(process.cwd(), "scenarios");
  if (!fs.existsSync(scenarioDir)) return [];
  const coverage: ScenarioCoverage[] = [];
  for (const file of fs.readdirSync(scenarioDir).filter((name) => name.endsWith(".json"))) {
    const fullPath = path.join(scenarioDir, file);
    const raw = fs.readFileSync(fullPath, "utf-8");
    const scenario = JSON.parse(raw) as Record<string, unknown>;
    coverage.push(analyzeScenario(scenario));
  }
  return coverage;
}
