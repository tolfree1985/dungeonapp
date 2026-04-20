import { WORLD_FLAGS } from "@/lib/engine/worldFlags";
import type { ActionIntent } from "@/server/turn/actionIntent";
import { evaluateRuleSet } from "@/server/turn/ruleEngine";

type IntentMode = ActionIntent["mode"];

type BlockedRuleIntentCondition = {
  mode?: IntentMode;
  verb?: string;
  inputIncludes?: string;
};

type BlockedRuleCondition =
  | { type: "flag"; key: string; equals: boolean }
  | { type: "stat"; key: string; gte?: number; lte?: number }
  | { type: "intent"; mode?: IntentMode; verb?: string; inputIncludes?: string };

export type BlockedRuleContext = {
  intent: Pick<ActionIntent, "mode" | "normalizedInput" | "rawInput" | "verb">;
  stateFlags: Record<string, boolean>;
  stateStats?: Record<string, number>;
};

export type BlockedRuleDef = {
  id: string;
  blockedAction: "move" | "look";
  intent: BlockedRuleIntentCondition;
  conditions: BlockedRuleCondition[];
  cause: string;
  effect: string;
  detail: string;
  scene: string;
  resolutionNotes: string;
  ledgerEntry: Record<string, unknown>;
};

export type BlockedRuleMatch = BlockedRuleDef & {
  matchedConditions: BlockedRuleCondition[];
};

export type BlockedTruth = {
  ruleId: string;
  blockedAction: "move" | "look";
  matchedConditions: BlockedRuleCondition[];
  cause: string;
  effect: string;
};

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

function isCanonicalWorldFlagKey(key: string): boolean {
  return CANONICAL_WORLD_FLAGS.has(key);
}

export function validateBlockedRules(rules: BlockedRuleDef[]): BlockedRuleDef[] {
  for (const rule of rules) {
    if (!rule.id) {
      throw new Error("Blocked rule validation failed: missing id");
    }
    if (!rule.intent || typeof rule.intent !== "object") {
      throw new Error(`Blocked rule validation failed: ${rule.id} missing intent`);
    }
    if (!rule.conditions.length) {
      throw new Error(`Blocked rule validation failed: ${rule.id} has no conditions`);
    }
    if (!rule.cause || !rule.effect || !rule.detail || !rule.scene || !rule.resolutionNotes) {
      throw new Error(`Blocked rule validation failed: ${rule.id} missing descriptive fields`);
    }

    for (const condition of rule.conditions) {
      if (condition.type === "flag") {
        if (!isCanonicalWorldFlagKey(condition.key)) {
          throw new Error(`Blocked rule validation failed: ${rule.id} uses unknown flag key ${condition.key}`);
        }
        continue;
      }

      if (condition.type === "stat") {
        if (!condition.key) {
          throw new Error(`Blocked rule validation failed: ${rule.id} has an empty stat key`);
        }
        continue;
      }

      if (condition.type === "intent") {
        if (condition.mode && !["DO", "LOOK", "SAY"].includes(condition.mode)) {
          throw new Error(`Blocked rule validation failed: ${rule.id} has invalid intent mode ${condition.mode}`);
        }
        if (condition.verb && !condition.verb.trim()) {
          throw new Error(`Blocked rule validation failed: ${rule.id} has an empty intent verb`);
        }
        if (condition.inputIncludes && !condition.inputIncludes.trim()) {
          throw new Error(`Blocked rule validation failed: ${rule.id} has an empty inputIncludes condition`);
        }
        continue;
      }

      throw new Error(`Blocked rule validation failed: ${rule.id} has an unknown condition type`);
    }
  }

  return rules;
}

const BLOCKED_RULE_DEFS = validateBlockedRules([
  {
    id: "MOVE_BLOCKED_BY_COLLAPSED_PASSAGE",
    blockedAction: "move",
    intent: {
      mode: "DO",
      verb: "move",
    },
    conditions: [
      {
        type: "flag",
        key: WORLD_FLAGS.route.collapsed,
        equals: true,
      },
    ],
    cause: "The passage has collapsed",
    effect: "Move prevented",
    detail: "The route is physically blocked and cannot be traversed until the obstruction changes.",
    scene: "The route ahead has collapsed and cannot be crossed.",
    resolutionNotes: "The passage is physically collapsed.",
    ledgerEntry: {
      id: "action.move.blocked.route_collapsed",
      kind: "action.blocked",
      blockedRuleId: "MOVE_BLOCKED_BY_COLLAPSED_PASSAGE",
      blockedAction: "move",
      cause: "The passage has collapsed",
      effect: "Move prevented",
      detail: "The route is physically blocked and cannot be traversed until the obstruction changes.",
    },
  },
  {
    id: "READ_INSCRIPTION_BLOCKED_BY_DARKNESS",
    blockedAction: "look",
    intent: {
      mode: "LOOK",
      verb: "read",
    },
    conditions: [
      {
        type: "flag",
        key: WORLD_FLAGS.room.darkness,
        equals: true,
      },
    ],
    cause: "The inscription is hidden in darkness",
    effect: "Reading prevented",
    detail: "There is not enough light to make out the inscription.",
    scene: "The inscription is hidden in darkness and cannot be read.",
    resolutionNotes: "The room is too dark to make out the inscription.",
    ledgerEntry: {
      id: "action.read.blocked.room_darkness",
      kind: "action.blocked",
      blockedRuleId: "READ_INSCRIPTION_BLOCKED_BY_DARKNESS",
      blockedAction: "look",
      cause: "The inscription is hidden in darkness",
      effect: "Reading prevented",
      detail: "There is not enough light to make out the inscription.",
    },
  },
]);

function matchesIntentCondition(
  rule: BlockedRuleDef,
  intent: BlockedRuleContext["intent"],
): boolean {
  const { mode, verb, inputIncludes } = rule.intent;
  if (mode && intent.mode !== mode) return false;
  if (verb && intent.verb !== verb) return false;
  if (inputIncludes && !intent.normalizedInput.includes(inputIncludes)) return false;
  return true;
}

function matchesCondition(condition: BlockedRuleCondition, ctx: BlockedRuleContext): boolean {
  switch (condition.type) {
    case "flag":
      return Boolean(ctx.stateFlags[condition.key]) === condition.equals;
    case "stat": {
      const value = Number(ctx.stateStats?.[condition.key] ?? 0);
      if (condition.gte !== undefined && value < condition.gte) return false;
      if (condition.lte !== undefined && value > condition.lte) return false;
      return true;
    }
    case "intent":
      return (
        (!condition.mode || ctx.intent.mode === condition.mode) &&
        (!condition.verb || ctx.intent.verb === condition.verb) &&
        (!condition.inputIncludes || ctx.intent.normalizedInput.includes(condition.inputIncludes))
      );
    default:
      return false;
  }
}

export function evaluateBlockedRule(
  ctx: BlockedRuleContext,
  rules: BlockedRuleDef[] = BLOCKED_RULE_DEFS,
): BlockedRuleMatch | null {
  return (
    evaluateRuleSet({
      rules,
      context: ctx,
      includeRule: (rule) => matchesIntentCondition(rule, ctx.intent),
      matchesRule: (rule, context) => {
        const matchedConditions = rule.conditions.filter((condition) => matchesCondition(condition, context));
        return matchedConditions.length === rule.conditions.length ? matchedConditions : null;
      },
      onMatch: () => false,
    })[0] ?? null
  );
}

export { BLOCKED_RULE_DEFS as BLOCKED_RULES };
