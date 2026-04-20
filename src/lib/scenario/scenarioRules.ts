import { WORLD_FLAGS } from "@/lib/engine/worldFlags";
import { BLOCKED_RULES, validateBlockedRules, type BlockedRuleDef } from "@/server/turn/blockedRules";
import type {
  PressureRuleCondition,
  PressureRuleDef,
  PressureRuleEffect,
} from "@/server/turn/pressureRules";
import { PRESSURE_RULES } from "@/server/turn/pressureRules";
import type {
  OpportunityRuleCondition,
  OpportunityRuleDef,
  OpportunityRuleEffect,
} from "@/server/turn/opportunityRules";
import { OPPORTUNITY_RULES } from "@/server/turn/opportunityRules";

export type ScenarioRuleBundle = {
  blocked: BlockedRuleDef[];
  pressure: PressureRuleDef[];
  opportunity: OpportunityRuleDef[];
};

export type ScenarioRuleBundleInput = {
  blocked?: unknown;
  pressure?: unknown;
  opportunity?: unknown;
};

export type RuleCatalog = ScenarioRuleBundle;

export type RuleDiagnosticType =
  | "dead_rule"
  | "overlap"
  | "unreachable"
  | "replace_error"
  | "pressure_cycle";

export type RuleDiagnostic = {
  type: RuleDiagnosticType;
  ruleId: string;
  message: string;
  severity: "error" | "warning";
  relatedRuleId?: string;
  family?: keyof ScenarioRuleBundle;
  suggestion?: string;
  suggestedFixes?: DiagnosticFixDescriptor[];
};

export type DiagnosticFixId = "add_replaces" | "remove_invalid_replace";

export type DiagnosticFixDescriptor = {
  id: DiagnosticFixId;
  label: string;
  ruleId: string;
  relatedRuleId?: string;
  family?: keyof ScenarioRuleBundle;
  description?: string;
};

export type RuleDiff = {
  type: "add" | "remove" | "change";
  path: string;
  before?: unknown;
  after?: unknown;
};

export type RuleAnalysis = {
  valid: boolean;
  diagnostics: RuleDiagnostic[];
  errors: RuleDiagnostic[];
  warnings: RuleDiagnostic[];
};

type RuleLike = { id: string; replaces?: unknown };

type ConditionRange = {
  min?: number;
  max?: number;
};

type ConditionSnapshot = {
  satisfiable: boolean;
  flagConstraints: Map<string, boolean>;
  statRanges: Map<string, ConditionRange>;
  intentModes: Set<string>;
  intentVerbs: Set<string>;
  readKeys: Set<string>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function collectWorldFlagValues(source: unknown, output = new Set<string>()): Set<string> {
  if (!source || typeof source !== "object") return output;
  for (const value of Object.values(source as Record<string, unknown>)) {
    if (typeof value === "string") {
      output.add(value);
      continue;
    }
    if (value && typeof value === "object") {
      collectWorldFlagValues(value, output);
    }
  }
  return output;
}

const CANONICAL_WORLD_FLAGS = collectWorldFlagValues(WORLD_FLAGS);

const DEFAULT_ENGINE_CATALOG: RuleCatalog = {
  blocked: BLOCKED_RULES,
  pressure: PRESSURE_RULES,
  opportunity: OPPORTUNITY_RULES,
};

function isCanonicalWorldFlagKey(key: string): boolean {
  return CANONICAL_WORLD_FLAGS.has(key);
}

function createConditionSnapshot(): ConditionSnapshot {
  return {
    satisfiable: true,
    flagConstraints: new Map<string, boolean>(),
    statRanges: new Map<string, ConditionRange>(),
    intentModes: new Set<string>(),
    intentVerbs: new Set<string>(),
    readKeys: new Set<string>(),
  };
}

function addRangeConstraint(
  ranges: Map<string, ConditionRange>,
  key: string,
  next: ConditionRange,
): boolean {
  const current = ranges.get(key) ?? {};
  const merged: ConditionRange = { ...current };
  if (next.min !== undefined) {
    merged.min = merged.min === undefined ? next.min : Math.max(merged.min, next.min);
  }
  if (next.max !== undefined) {
    merged.max = merged.max === undefined ? next.max : Math.min(merged.max, next.max);
  }
  if (merged.min !== undefined && merged.max !== undefined && merged.min > merged.max) {
    return false;
  }
  ranges.set(key, merged);
  return true;
}

function analyzeBlockedConditions(conditions: BlockedRuleDef["conditions"]): ConditionSnapshot {
  const snapshot = createConditionSnapshot();

  for (const condition of conditions) {
    if (condition.type === "flag") {
      snapshot.readKeys.add(condition.key);
      const current = snapshot.flagConstraints.get(condition.key);
      if (current !== undefined && current !== condition.equals) {
        snapshot.satisfiable = false;
        return snapshot;
      }
      snapshot.flagConstraints.set(condition.key, condition.equals);
      continue;
    }

    if (condition.type === "stat") {
      snapshot.readKeys.add(condition.key);
      const nextRange: ConditionRange = {};
      if (condition.gte !== undefined) nextRange.min = condition.gte;
      if (condition.lte !== undefined) nextRange.max = condition.lte;
      if (!addRangeConstraint(snapshot.statRanges, condition.key, nextRange)) {
        snapshot.satisfiable = false;
        return snapshot;
      }
      continue;
    }

    if (condition.type === "intent") {
      if (condition.mode) {
        if (snapshot.intentModes.size && !snapshot.intentModes.has(condition.mode)) {
          snapshot.satisfiable = false;
          return snapshot;
        }
        snapshot.intentModes.add(condition.mode);
      }
      if (condition.verb) {
        if (snapshot.intentVerbs.size && !snapshot.intentVerbs.has(condition.verb)) {
          snapshot.satisfiable = false;
          return snapshot;
        }
        snapshot.intentVerbs.add(condition.verb);
      }
      if (condition.inputIncludes) {
        snapshot.readKeys.add(`input:${condition.inputIncludes}`);
      }
    }
  }

  return snapshot;
}

function analyzePressureConditions(conditions: PressureRuleCondition[][]): ConditionSnapshot[] {
  return conditions.map((group) => {
    const snapshot = createConditionSnapshot();
    for (const condition of group) {
      if (condition.type === "flag") {
        snapshot.readKeys.add(condition.key);
        const current = snapshot.flagConstraints.get(condition.key);
        if (current !== undefined && current !== condition.equals) {
          snapshot.satisfiable = false;
          return snapshot;
        }
        snapshot.flagConstraints.set(condition.key, condition.equals);
        continue;
      }

      if (condition.type === "statAtLeast") {
        snapshot.readKeys.add(condition.key);
        if (!addRangeConstraint(snapshot.statRanges, condition.key, { min: condition.value })) {
          snapshot.satisfiable = false;
          return snapshot;
        }
        continue;
      }

      if (condition.type === "stageCrosses") {
        if (condition.from) snapshot.readKeys.add(`stage:${condition.from}`);
        if (condition.to) snapshot.readKeys.add(`stage:${condition.to}`);
      }
    }
    return snapshot;
  });
}

function analyzeOpportunityConditions(conditions: OpportunityRuleCondition[][]): ConditionSnapshot[] {
  return conditions.map((group) => {
    const snapshot = createConditionSnapshot();
    for (const condition of group) {
      if (condition.type === "intentMode") {
        if (snapshot.intentModes.size && !snapshot.intentModes.has(condition.mode)) {
          snapshot.satisfiable = false;
          return snapshot;
        }
        snapshot.intentModes.add(condition.mode);
        continue;
      }
      if (condition.type === "inputIncludes") {
        snapshot.readKeys.add(`input:${condition.value}`);
        continue;
      }
      if (condition.type === "sceneTextIncludes") {
        snapshot.readKeys.add(`scene:${condition.value}`);
        continue;
      }
      if (condition.type === "effectSummaryIncludes") {
        snapshot.readKeys.add(`effect:${condition.value}`);
        continue;
      }
      if (condition.type === "sceneClockAtLeast") {
        if (!addRangeConstraint(snapshot.statRanges, "sceneClock", { min: condition.value })) {
          snapshot.satisfiable = false;
          return snapshot;
        }
      }
    }
    return snapshot;
  });
}

function validatePressureRuleCondition(ruleId: string, condition: PressureRuleCondition): void {
  if (!condition || typeof condition !== "object") {
    throw new Error(`Pressure rule validation failed: ${ruleId} has a malformed condition`);
  }

  switch (condition.type) {
    case "flag":
      if (!condition.key || !isCanonicalWorldFlagKey(condition.key)) {
        throw new Error(`Pressure rule validation failed: ${ruleId} uses unknown flag key ${condition.key}`);
      }
      if (typeof condition.equals !== "boolean") {
        throw new Error(`Pressure rule validation failed: ${ruleId} has an invalid flag.equals condition`);
      }
      return;
    case "statAtLeast":
      if (!condition.key) {
        throw new Error(`Pressure rule validation failed: ${ruleId} has an empty statAtLeast key`);
      }
      if (!Number.isFinite(condition.value)) {
        throw new Error(`Pressure rule validation failed: ${ruleId} has an invalid statAtLeast value`);
      }
      return;
    case "stageCrosses":
      if (condition.from && !["calm", "tension", "danger", "crisis"].includes(condition.from)) {
        throw new Error(`Pressure rule validation failed: ${ruleId} has an invalid stageCrosses.from`);
      }
      if (condition.to && !["calm", "tension", "danger", "crisis"].includes(condition.to)) {
        throw new Error(`Pressure rule validation failed: ${ruleId} has an invalid stageCrosses.to`);
      }
      return;
    default:
      throw new Error(`Pressure rule validation failed: ${ruleId} has an unknown condition type`);
  }
}

function validatePressureRuleEffect(ruleId: string, effect: PressureRuleEffect): void {
  if (!effect || typeof effect !== "object") {
    throw new Error(`Pressure rule validation failed: ${ruleId} has a malformed effect`);
  }

  switch (effect.type) {
    case "flag.set":
      if (!effect.key || !isCanonicalWorldFlagKey(effect.key)) {
        throw new Error(`Pressure rule validation failed: ${ruleId} uses unknown flag key ${effect.key}`);
      }
      if (typeof effect.value !== "boolean") {
        throw new Error(`Pressure rule validation failed: ${ruleId} has an invalid flag.set value`);
      }
      if (!effect.detail || typeof effect.detail !== "string") {
        throw new Error(`Pressure rule validation failed: ${ruleId} has a missing flag.set detail`);
      }
      return;
    case "modifier.set":
      if (!effect.key || typeof effect.key !== "string") {
        throw new Error(`Pressure rule validation failed: ${ruleId} has an empty modifier key`);
      }
      if (!Number.isFinite(effect.value)) {
        throw new Error(`Pressure rule validation failed: ${ruleId} has an invalid modifier value`);
      }
      if (!effect.detail || typeof effect.detail !== "string") {
        throw new Error(`Pressure rule validation failed: ${ruleId} has a missing modifier detail`);
      }
      return;
    default:
      throw new Error(`Pressure rule validation failed: ${ruleId} has an unknown effect type`);
  }
}

function validatePressureRules(rules: PressureRuleDef[]): PressureRuleDef[] {
  for (const rule of rules) {
    if (!rule || typeof rule !== "object") {
      throw new Error("Scenario rule validation failed: malformed pressure rule");
    }
    if (!rule.id) {
      throw new Error("Scenario rule validation failed: pressure rule missing id");
    }
    if (!["pressure", "modifier"].includes(rule.category)) {
      throw new Error(`Scenario rule validation failed: ${rule.id} has invalid category`);
    }
    if (!Array.isArray(rule.when) || !rule.when.length) {
      throw new Error(`Scenario rule validation failed: ${rule.id} has no conditions`);
    }
    if (!Array.isArray(rule.effects) || !rule.effects.length) {
      throw new Error(`Scenario rule validation failed: ${rule.id} has no effects`);
    }
    if (!rule.ledger || typeof rule.ledger !== "object") {
      throw new Error(`Scenario rule validation failed: ${rule.id} is missing ledger`);
    }
    if (!rule.ledger.cause || !rule.ledger.effect || !rule.ledger.detail) {
      throw new Error(`Scenario rule validation failed: ${rule.id} is missing ledger detail`);
    }
    for (const group of rule.when) {
      if (!Array.isArray(group) || !group.length) {
        throw new Error(`Scenario rule validation failed: ${rule.id} has an empty condition group`);
      }
      for (const condition of group) {
        validatePressureRuleCondition(rule.id, condition as PressureRuleCondition);
      }
    }
    for (const effect of rule.effects) {
      validatePressureRuleEffect(rule.id, effect as PressureRuleEffect);
    }
  }
  return rules;
}

function validateOpportunityRuleCondition(ruleId: string, condition: OpportunityRuleCondition): void {
  if (!condition || typeof condition !== "object") {
    throw new Error(`Opportunity rule validation failed: ${ruleId} has a malformed condition`);
  }

  switch (condition.type) {
    case "intentMode":
      if (!condition.mode || !["DO", "LOOK", "SAY"].includes(condition.mode)) {
        throw new Error(`Opportunity rule validation failed: ${ruleId} has an invalid intentMode`);
      }
      return;
    case "inputIncludes":
    case "sceneTextIncludes":
      if (!condition.value || typeof condition.value !== "string") {
        throw new Error(`Opportunity rule validation failed: ${ruleId} has an invalid text condition`);
      }
      return;
    case "effectSummaryIncludes":
      if (!condition.value || typeof condition.value !== "string") {
        throw new Error(`Opportunity rule validation failed: ${ruleId} has an invalid effect summary`);
      }
      return;
    case "sceneClockAtLeast":
      if (!Number.isFinite(condition.value)) {
        throw new Error(`Opportunity rule validation failed: ${ruleId} has an invalid sceneClockAtLeast value`);
      }
      return;
    default:
      throw new Error(`Opportunity rule validation failed: ${ruleId} has an unknown condition type`);
  }
}

function validateOpportunityRuleEffect(ruleId: string, effect: OpportunityRuleEffect): void {
  if (!effect || typeof effect !== "object") {
    throw new Error(`Opportunity rule validation failed: ${ruleId} has a malformed effect`);
  }

  switch (effect.type) {
    case "window.set":
      if (!["normal", "reduced"].includes(effect.opportunityTier)) {
        throw new Error(`Opportunity rule validation failed: ${ruleId} has an invalid opportunity tier`);
      }
      if (typeof effect.windowNarrowed !== "boolean") {
        throw new Error(`Opportunity rule validation failed: ${ruleId} has an invalid windowNarrowed value`);
      }
      if (!effect.detail || typeof effect.detail !== "string") {
        throw new Error(`Opportunity rule validation failed: ${ruleId} has a missing window detail`);
      }
      return;
    case "ledger":
      if (!effect.cause || !effect.effect || !effect.detail) {
        throw new Error(`Opportunity rule validation failed: ${ruleId} has a missing ledger detail`);
      }
      return;
    default:
      throw new Error(`Opportunity rule validation failed: ${ruleId} has an unknown effect type`);
  }
}

function validateOpportunityRules(rules: OpportunityRuleDef[]): OpportunityRuleDef[] {
  for (const rule of rules) {
    if (!rule || typeof rule !== "object") {
      throw new Error("Scenario rule validation failed: malformed opportunity rule");
    }
    if (!rule.id) {
      throw new Error("Scenario rule validation failed: opportunity rule missing id");
    }
    if (!Array.isArray(rule.when) || !rule.when.length) {
      throw new Error(`Scenario rule validation failed: ${rule.id} has no conditions`);
    }
    if (!Array.isArray(rule.effects) || !rule.effects.length) {
      throw new Error(`Scenario rule validation failed: ${rule.id} has no effects`);
    }
    for (const group of rule.when) {
      if (!Array.isArray(group) || !group.length) {
        throw new Error(`Scenario rule validation failed: ${rule.id} has an empty condition group`);
      }
      for (const condition of group) {
        validateOpportunityRuleCondition(rule.id, condition as OpportunityRuleCondition);
      }
    }
    for (const effect of rule.effects) {
      validateOpportunityRuleEffect(rule.id, effect as OpportunityRuleEffect);
    }
  }
  return rules;
}

function readRuleArray(input: Record<string, unknown>, key: keyof ScenarioRuleBundleInput): unknown[] | null {
  if (!Object.prototype.hasOwnProperty.call(input, key)) return null;
  const value = input[key];
  if (value == null) return null;
  if (!Array.isArray(value)) {
    throw new Error(`Scenario rule validation failed: ${String(key)} must be an array`);
  }
  return value;
}

function readReplaceIds(rule: RuleLike): string[] {
  if (!Object.prototype.hasOwnProperty.call(rule, "replaces")) return [];
  const raw = rule.replaces;
  if (raw == null) return [];
  if (!Array.isArray(raw)) {
    throw new Error(`Scenario rule validation failed: ${rule.id} has an invalid replaces field`);
  }
  const ids = raw
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  if (ids.length !== raw.length) {
    throw new Error(`Scenario rule validation failed: ${rule.id} has an invalid replaces field`);
  }
  return ids;
}

function ensureUniqueIds<T extends RuleLike>(rules: T[], family: string): T[] {
  const seen = new Set<string>();
  for (const rule of rules) {
    if (seen.has(rule.id)) {
      throw new Error(`Scenario rule validation failed: duplicate ${family} rule id ${rule.id}`);
    }
    seen.add(rule.id);
  }
  return rules;
}

function blockedRuleSignature(rule: BlockedRuleDef): string {
  return [rule.blockedAction, rule.intent.mode ?? "", rule.intent.verb ?? ""].join("|");
}

function blockedRulesCanOverlap(a: BlockedRuleDef, b: BlockedRuleDef): boolean {
  if (a.blockedAction !== b.blockedAction) return false;
  if (a.intent.mode && b.intent.mode && a.intent.mode !== b.intent.mode) return false;
  if (a.intent.verb && b.intent.verb && a.intent.verb !== b.intent.verb) return false;
  const merged = analyzeBlockedConditions([...a.conditions, ...b.conditions]);
  return merged.satisfiable;
}

function pressureWrites(rule: PressureRuleDef): Set<string> {
  const writes = new Set<string>();
  for (const effect of rule.effects) {
    if (effect.type === "flag.set") {
      writes.add(effect.key);
    } else if (effect.type === "modifier.set") {
      writes.add(effect.key);
    }
  }
  return writes;
}

function opportunityWrites(rule: OpportunityRuleDef): Set<string> {
  const writes = new Set<string>();
  for (const effect of rule.effects) {
    if (effect.type === "window.set") {
      writes.add(`opportunity:${effect.opportunityTier}`);
    }
  }
  return writes;
}

function collectCatalogRuleIds(catalog: RuleCatalog): Set<string> {
  const ids = new Set<string>();
  for (const family of [catalog.blocked, catalog.pressure, catalog.opportunity]) {
    for (const rule of family) {
      ids.add(rule.id);
    }
  }
  return ids;
}

function collectCatalogWrites(catalog: RuleCatalog): Set<string> {
  const writes = new Set<string>();
  for (const rule of catalog.pressure) {
    for (const key of pressureWrites(rule)) writes.add(key);
  }
  for (const rule of catalog.opportunity) {
    for (const key of opportunityWrites(rule)) writes.add(key);
  }
  return writes;
}

function makeDiagnostic(
  type: RuleDiagnosticType,
  severity: "error" | "warning",
  ruleId: string,
  message: string,
  relatedRuleId?: string,
  family?: keyof ScenarioRuleBundle,
  suggestion?: string,
  suggestedFixes?: DiagnosticFixDescriptor[],
): RuleDiagnostic {
  return { type, severity, ruleId, message, relatedRuleId, family, suggestion, suggestedFixes };
}

function analyzeBlockedFamily(
  scenarioRules: BlockedRuleDef[],
  engineRules: BlockedRuleDef[],
  diagnostics: RuleDiagnostic[],
): void {
  const emittedOverlapKeys = new Set<string>();
  for (const rule of scenarioRules) {
    const snapshot = analyzeBlockedConditions(rule.conditions);
    if (!snapshot.satisfiable) {
      diagnostics.push(
          makeDiagnostic(
            "dead_rule",
            "error",
            rule.id,
            `Blocked rule ${rule.id} can never match because its conditions contradict each other.`,
            undefined,
            "blocked",
            "Remove the contradictory conditions or split this rule into separate cases.",
          ),
        );
    }
  }

  const scenarioAndEngine = [
    ...scenarioRules.map((rule) => ({ rule, source: "scenario" as const })),
    ...engineRules.map((rule) => ({ rule, source: "engine" as const })),
  ];
  for (let i = 0; i < scenarioAndEngine.length; i++) {
    for (let j = i + 1; j < scenarioAndEngine.length; j++) {
      const left = scenarioAndEngine[i];
      const right = scenarioAndEngine[j];
      if (left.rule.id === right.rule.id) continue;
      if (!blockedRulesCanOverlap(left.rule, right.rule)) continue;
      if (blockedRuleSignature(left.rule) !== blockedRuleSignature(right.rule)) continue;
      const leftReplaces = new Set(readReplaceIds(left.rule));
      const rightReplaces = new Set(readReplaceIds(right.rule));
      if (leftReplaces.has(right.rule.id) || rightReplaces.has(left.rule.id)) continue;
      const pairKey = [left.rule.id, right.rule.id].sort(compareText).join("::");
      if (emittedOverlapKeys.has(pairKey)) continue;
      emittedOverlapKeys.add(pairKey);
      const targetRuleId = right.source === "scenario" ? right.rule.id : left.rule.id;
      const relatedRuleId = right.source === "scenario" ? left.rule.id : right.rule.id;
      diagnostics.push(
          makeDiagnostic(
            "overlap",
            "warning",
            left.rule.id,
            `Rule ${left.rule.id} overlaps with ${right.rule.id}. This rule will shadow another due to FIRST_MATCH ordering.`,
            right.rule.id,
            "blocked",
            "Narrow the conditions or use 'replaces' to explicitly override the broader rule.",
            [
              {
                id: "add_replaces",
                label: "Add replaces",
                ruleId: targetRuleId,
                relatedRuleId,
                family: "blocked",
                description: `Make ${targetRuleId} explicitly replace ${relatedRuleId}.`,
              },
            ],
          ),
        );
    }
  }
}

function analyzePressureFamily(
  scenarioRules: PressureRuleDef[],
  engineRules: PressureRuleDef[],
  diagnostics: RuleDiagnostic[],
): void {
  const combined = [...scenarioRules, ...engineRules];
  for (const rule of scenarioRules) {
    const groupSnapshots = analyzePressureConditions(rule.when);
    if (!groupSnapshots.some((snapshot) => snapshot.satisfiable)) {
      diagnostics.push(
          makeDiagnostic(
            "dead_rule",
            "error",
            rule.id,
            `Pressure rule ${rule.id} can never match because every condition group is contradictory.`,
            undefined,
            "pressure",
            "Remove the contradictory conditions or simplify the rule groups.",
          ),
        );
    }
  }

  const ruleById = new Map(combined.map((rule) => [rule.id, rule] as const));
  const adjacency = new Map<string, Set<string>>();
  const pressureReads = new Map<string, Set<string>>();
  const pressureWritesByRule = new Map<string, Set<string>>();

  for (const rule of combined) {
    const reads = new Set<string>();
    for (const group of rule.when) {
      for (const condition of group) {
        if (condition.type === "flag") reads.add(condition.key);
        if (condition.type === "statAtLeast") reads.add(condition.key);
        if (condition.type === "stageCrosses") {
          if (condition.from) reads.add(`stage:${condition.from}`);
          if (condition.to) reads.add(`stage:${condition.to}`);
        }
      }
    }
    pressureReads.set(rule.id, reads);
    pressureWritesByRule.set(rule.id, pressureWrites(rule));
    adjacency.set(rule.id, new Set<string>());
  }

  for (const [ruleId, reads] of pressureReads) {
    for (const [otherId, writes] of pressureWritesByRule) {
      if (ruleId === otherId) continue;
      const hasEdge = [...reads].some((read) => writes.has(read));
      if (hasEdge) {
        adjacency.get(otherId)?.add(ruleId);
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];
  const cycles = new Set<string>();

  const visit = (id: string): void => {
    if (visiting.has(id)) {
      const cycleStart = stack.indexOf(id);
      if (cycleStart >= 0) {
        const cycle = stack.slice(cycleStart).concat(id);
        cycles.add(cycle.join(" -> "));
      }
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    stack.push(id);
    for (const next of adjacency.get(id) ?? []) {
      visit(next);
    }
    stack.pop();
    visiting.delete(id);
    visited.add(id);
  };

  for (const id of adjacency.keys()) {
    visit(id);
  }

  for (const cycle of cycles) {
    const [first] = cycle.split(" -> ");
      diagnostics.push(
        makeDiagnostic(
          "pressure_cycle",
          "warning",
          first,
          `Pressure rules form a cycle: ${cycle}. Verify this is intentional.`,
          undefined,
          "pressure",
          "Check whether one of the pressure rules should stop escalating or use a narrower trigger.",
        ),
      );
  }
}

function analyzeOpportunityFamily(
  scenarioRules: OpportunityRuleDef[],
  engineRules: OpportunityRuleDef[],
  diagnostics: RuleDiagnostic[],
): void {
  for (const rule of scenarioRules) {
    const groupSnapshots = analyzeOpportunityConditions(rule.when);
    if (!groupSnapshots.some((snapshot) => snapshot.satisfiable)) {
      diagnostics.push(
          makeDiagnostic(
            "dead_rule",
            "error",
            rule.id,
            `Opportunity rule ${rule.id} can never match because every condition group is contradictory.`,
            undefined,
            "opportunity",
            "Remove the contradictory conditions or simplify the opportunity window requirements.",
          ),
        );
    }
  }
}

function analyzeReplaceIntegrity(
  scenarioBundle: ScenarioRuleBundle,
  engineCatalog: RuleCatalog,
  diagnostics: RuleDiagnostic[],
): void {
  const knownIds = collectCatalogRuleIds({
    blocked: [...engineCatalog.blocked, ...scenarioBundle.blocked],
    pressure: [...engineCatalog.pressure, ...scenarioBundle.pressure],
    opportunity: [...engineCatalog.opportunity, ...scenarioBundle.opportunity],
  });
  for (const family of [scenarioBundle.blocked, scenarioBundle.pressure, scenarioBundle.opportunity]) {
    for (const rule of family) {
      for (const replaceId of readReplaceIds(rule)) {
        if (!knownIds.has(replaceId)) {
          diagnostics.push(
          makeDiagnostic(
            "replace_error",
            "error",
            rule.id,
            `Scenario rule ${rule.id} replaces unknown rule ${replaceId}.`,
            replaceId,
            undefined,
            "Point replaces at an existing built-in or sibling scenario rule id.",
            [
              {
                id: "remove_invalid_replace",
                label: "Remove invalid replace",
                ruleId: rule.id,
                relatedRuleId: replaceId,
                description: `Remove ${replaceId} from ${rule.id}.replaces.`,
              },
            ],
          ),
        );
        }
      }
    }
  }
}

function analyzeUnreachableConditions(
  scenarioBundle: ScenarioRuleBundle,
  engineCatalog: RuleCatalog,
  diagnostics: RuleDiagnostic[],
): void {
  const knownWrites = collectCatalogWrites({
    blocked: [...engineCatalog.blocked, ...scenarioBundle.blocked],
    pressure: [...engineCatalog.pressure, ...scenarioBundle.pressure],
    opportunity: [...engineCatalog.opportunity, ...scenarioBundle.opportunity],
  });

  const inspectRules = <T extends { id: string }>(
    rules: T[],
    family: keyof ScenarioRuleBundle,
    readKeys: (rule: T) => Set<string>,
  ): void => {
    for (const rule of rules) {
      for (const key of readKeys(rule)) {
        if (key.startsWith("input:") || key.startsWith("scene:") || key.startsWith("effect:") || key.startsWith("stage:")) {
          continue;
        }
        if (!knownWrites.has(key)) {
          diagnostics.push(
          makeDiagnostic(
            "unreachable",
            "warning",
            rule.id,
            `Rule ${rule.id} reads ${key}, but no rule in the catalog writes that key. Verify initial state or add a writer.`,
            undefined,
            family,
            "Either seed this key in initial state or add a rule that writes it.",
          ),
        );
        }
      }
    }
  };

  inspectRules(scenarioBundle.blocked, "blocked", (rule) => {
    const reads = new Set<string>();
    for (const condition of rule.conditions) {
      if (condition.type === "flag" || condition.type === "stat") reads.add(condition.key);
      if (condition.type === "intent" && condition.verb) reads.add(`input:${condition.verb}`);
    }
    return reads;
  });

  inspectRules(scenarioBundle.pressure, "pressure", (rule) => {
    const reads = new Set<string>();
    for (const group of rule.when) {
      for (const condition of group) {
        if (condition.type === "flag" || condition.type === "statAtLeast") reads.add(condition.key);
        if (condition.type === "stageCrosses") {
          if (condition.from) reads.add(`stage:${condition.from}`);
          if (condition.to) reads.add(`stage:${condition.to}`);
        }
      }
    }
    return reads;
  });

  inspectRules(scenarioBundle.opportunity, "opportunity", (rule) => {
    const reads = new Set<string>();
    for (const group of rule.when) {
      for (const condition of group) {
        if (condition.type === "intentMode") reads.add(`input:${condition.mode}`);
        if (condition.type === "inputIncludes") reads.add(`input:${condition.value}`);
        if (condition.type === "sceneTextIncludes") reads.add(`scene:${condition.value}`);
        if (condition.type === "effectSummaryIncludes") reads.add(`effect:${condition.value}`);
      }
    }
    return reads;
  });
}

function analyzeScenarioRuleBundleInternal(
  bundle: ScenarioRuleBundle,
  engineCatalog: RuleCatalog = DEFAULT_ENGINE_CATALOG,
): RuleAnalysis {
  const diagnostics: RuleDiagnostic[] = [];

  analyzeBlockedFamily(bundle.blocked, engineCatalog.blocked, diagnostics);
  analyzePressureFamily(bundle.pressure, engineCatalog.pressure, diagnostics);
  analyzeOpportunityFamily(bundle.opportunity, engineCatalog.opportunity, diagnostics);
  analyzeReplaceIntegrity(bundle, engineCatalog, diagnostics);
  analyzeUnreachableConditions(bundle, engineCatalog, diagnostics);

  const errors = diagnostics.filter((diag) => diag.severity === "error");
  const warnings = diagnostics.filter((diag) => diag.severity === "warning");
  return {
    valid: errors.length === 0,
    diagnostics,
    errors,
    warnings,
  };
}

export function normalizeScenarioRuleBundle(input: ScenarioRuleBundleInput | null | undefined): ScenarioRuleBundle | null {
  if (!input || typeof input !== "object") return null;

  const blockedInput = readRuleArray(input, "blocked");
  const pressureInput = readRuleArray(input, "pressure");
  const opportunityInput = readRuleArray(input, "opportunity");

  const blocked = blockedInput ? validateBlockedRules(blockedInput as BlockedRuleDef[]) : [];
  const pressure = pressureInput ? validatePressureRules(pressureInput as PressureRuleDef[]) : [];
  const opportunity = opportunityInput ? validateOpportunityRules(opportunityInput as OpportunityRuleDef[]) : [];
  ensureUniqueIds(blocked, "blocked");
  ensureUniqueIds(pressure, "pressure");
  ensureUniqueIds(opportunity, "opportunity");

  if (!blocked.length && !pressure.length && !opportunity.length) {
    return null;
  }

  return { blocked, pressure, opportunity };
}

export function readScenarioRuleBundleFromState(state: unknown): ScenarioRuleBundle | null {
  if (!isRecord(state)) return null;
  const meta = isRecord(state._meta) ? state._meta : null;
  if (!meta) return null;
  const candidate = (meta.scenarioRules ?? meta.rules ?? null) as ScenarioRuleBundleInput | null;
  const normalized = normalizeScenarioRuleBundle(candidate);
  if (normalized) {
    validateScenarioRuleBundleSemantically(normalized);
  }
  return normalized;
}

export function analyzeScenarioRuleBundle(
  bundle: ScenarioRuleBundle,
  engineCatalog: RuleCatalog = DEFAULT_ENGINE_CATALOG,
): RuleAnalysis {
  return analyzeScenarioRuleBundleInternal(bundle, engineCatalog);
}

export function validateScenarioRuleBundleSemantically(
  bundle: ScenarioRuleBundle,
  engineCatalog: RuleCatalog = DEFAULT_ENGINE_CATALOG,
): RuleAnalysis {
  const analysis = analyzeScenarioRuleBundleInternal(bundle, engineCatalog);
  if (analysis.errors.length) {
    const error = new Error("Scenario rule semantic validation failed");
    (error as Error & { diagnostics?: RuleAnalysis }).diagnostics = analysis;
    throw error;
  }
  return analysis;
}

function cloneRuleWithReplaces<T extends RuleLike>(rule: T, replaces: string[] | undefined): T {
  const next = { ...rule } as T & { replaces?: string[] };
  if (replaces.length) {
    next.replaces = [...replaces];
  } else {
    delete next.replaces;
  }
  return next;
}

function updateRuleFamilyWithFix<T extends RuleLike>(
  rules: T[],
  fix: DiagnosticFixDescriptor,
  mutate: (rule: T) => T,
): T[] {
  return rules.map((rule) => {
    if (rule.id !== fix.ruleId) return rule;
    return mutate(rule);
  });
}

export function applyScenarioDiagnosticFix(
  bundle: ScenarioRuleBundle,
  fix: DiagnosticFixDescriptor,
): ScenarioRuleBundle {
  switch (fix.id) {
    case "add_replaces":
      return {
        ...bundle,
        blocked: updateRuleFamilyWithFix(bundle.blocked, fix, (rule) => {
          const current = readReplaceIds(rule);
          const next = new Set(current);
          if (fix.relatedRuleId) {
            next.add(fix.relatedRuleId);
          }
          return cloneRuleWithReplaces(rule, [...next]);
        }),
        pressure: bundle.pressure,
        opportunity: bundle.opportunity,
      };
    case "remove_invalid_replace":
      return {
        ...bundle,
        blocked: updateRuleFamilyWithFix(bundle.blocked, fix, (rule) => {
          const current = readReplaceIds(rule).filter((replaceId) => replaceId !== fix.relatedRuleId);
          return cloneRuleWithReplaces(rule, current);
        }),
        pressure: updateRuleFamilyWithFix(bundle.pressure, fix, (rule) => {
          const current = readReplaceIds(rule).filter((replaceId) => replaceId !== fix.relatedRuleId);
          return cloneRuleWithReplaces(rule, current);
        }),
        opportunity: updateRuleFamilyWithFix(bundle.opportunity, fix, (rule) => {
          const current = readReplaceIds(rule).filter((replaceId) => replaceId !== fix.relatedRuleId);
          return cloneRuleWithReplaces(rule, current);
        }),
      };
    default:
      return bundle;
  }
}

function diffValues(before: unknown, after: unknown, path: string, output: RuleDiff[]): void {
  if (before === after) return;

  if (before === undefined) {
    output.push({ type: "add", path, after });
    return;
  }

  if (after === undefined) {
    output.push({ type: "remove", path, before });
    return;
  }

  if (
    before === null ||
    after === null ||
    typeof before !== "object" ||
    typeof after !== "object" ||
    Array.isArray(before) !== Array.isArray(after)
  ) {
    output.push({ type: "change", path, before, after });
    return;
  }

  if (Array.isArray(before) && Array.isArray(after)) {
    const length = Math.max(before.length, after.length);
    for (let index = 0; index < length; index++) {
      diffValues(before[index], after[index], `${path}[${index}]`, output);
    }
    return;
  }

  const beforeKeys = Object.keys(before as Record<string, unknown>);
  const afterKeys = Object.keys(after as Record<string, unknown>);
  const keys = new Set([...beforeKeys, ...afterKeys]);
  for (const key of [...keys].sort(compareText)) {
    diffValues(
      (before as Record<string, unknown>)[key],
      (after as Record<string, unknown>)[key],
      `${path}.${key}`,
      output,
    );
  }
}

export function diffScenarioRuleBundles(
  before: ScenarioRuleBundle,
  after: ScenarioRuleBundle,
): RuleDiff[] {
  const diffs: RuleDiff[] = [];
  diffValues(before, after, "", diffs);
  return diffs.map((diff) => ({
    ...diff,
    path: diff.path.startsWith(".") ? diff.path.slice(1) : diff.path,
  }));
}

export function mergeRuleCatalog(base: RuleCatalog, extra: ScenarioRuleBundle | null): RuleCatalog {
  if (!extra) return base;
  const mergeFamily = <T extends RuleLike>(scenarioRules: T[], baseRules: T[]): T[] => {
    const allKnownIds = new Set([...scenarioRules, ...baseRules].map((rule) => rule.id));
    const merged: T[] = [];
    const seen = new Set<string>();
    const disabled = new Set<string>();

    for (const rule of scenarioRules) {
      for (const replaceId of readReplaceIds(rule)) {
        if (!allKnownIds.has(replaceId)) {
          throw new Error(`Scenario rule merge failed: ${rule.id} replaces unknown rule ${replaceId}`);
        }
        disabled.add(replaceId);
        for (let index = merged.length - 1; index >= 0; index--) {
          if (merged[index].id === replaceId) {
            merged.splice(index, 1);
            seen.delete(replaceId);
          }
        }
      }
      if (seen.has(rule.id)) continue;
      merged.push(rule);
      seen.add(rule.id);
    }

    for (const rule of baseRules) {
      if (disabled.has(rule.id)) continue;
      if (seen.has(rule.id)) continue;
      merged.push(rule);
      seen.add(rule.id);
    }

    return merged;
  };

  return {
    blocked: mergeFamily(extra.blocked, base.blocked),
    pressure: mergeFamily(extra.pressure, base.pressure),
    opportunity: mergeFamily(extra.opportunity, base.opportunity),
  };
}

export function sortRuleIds(rules: { id: string }[]): string[] {
  return rules.map((rule) => rule.id).sort(compareText);
}
