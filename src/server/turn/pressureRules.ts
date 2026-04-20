import { WORLD_FLAGS } from "@/lib/engine/worldFlags";
import { evaluateRuleSet } from "@/server/turn/ruleEngine";

export type PressureRuleCategory = "pressure" | "modifier";

export type PressureRuleCondition =
  | { type: "flag"; key: string; equals: boolean }
  | { type: "statAtLeast"; key: "suspicion" | "noise" | "time" | "danger"; value: number }
  | { type: "stageCrosses"; from?: "calm" | "tension" | "danger" | "crisis"; to?: "calm" | "tension" | "danger" | "crisis" };

export type PressureRuleEffect =
  | { type: "flag.set"; key: string; value: boolean; detail: string }
  | { type: "modifier.set"; key: string; value: number; detail: string };

export type PressureRuleDef = {
  id: string;
  category: PressureRuleCategory;
  when: PressureRuleCondition[][];
  effects: PressureRuleEffect[];
  ledger: {
    kind: "system.effect";
    cause: string;
    effect: string;
    detail: string;
  };
};

export type PressureRuleContext = {
  prevFlags: Record<string, boolean>;
  nextFlags: Record<string, boolean>;
  prevStats: Record<string, number>;
  nextStats: Record<string, number>;
  prevStage: "calm" | "tension" | "danger" | "crisis";
  nextStage: "calm" | "tension" | "danger" | "crisis";
};

export type PressureRuleMatch = PressureRuleDef & {
  matchedConditions: PressureRuleCondition[];
};

export type PressureTruthRule = {
  ruleId: string;
  matchedConditions: PressureRuleCondition[];
  effects: PressureRuleEffect[];
};

export type PressureTruth = {
  rulesTriggered: PressureTruthRule[];
};

export type PressureRuleResult = {
  stateDeltas: Array<Record<string, unknown>>;
  ledgerAdds: Array<Record<string, unknown>>;
  matchedRules: PressureRuleMatch[];
};

function cloneFlags(flags: Record<string, boolean>): Record<string, boolean> {
  return { ...flags };
}

function matchesCondition(condition: PressureRuleCondition, ctx: PressureRuleContext): boolean {
  switch (condition.type) {
    case "flag":
      return Boolean(ctx.nextFlags[condition.key]) === condition.equals;
    case "statAtLeast":
      return Number(ctx.nextStats[condition.key] ?? 0) >= condition.value;
    case "stageCrosses":
      if (condition.from && ctx.prevStage !== condition.from) return false;
      if (condition.to && ctx.nextStage !== condition.to) return false;
      return true;
    default:
      return false;
  }
}

function matchesRule(rule: PressureRuleDef, ctx: PressureRuleContext): PressureRuleCondition[] | null {
  for (const group of rule.when) {
    if (group.every((condition) => matchesCondition(condition, ctx))) {
      return group;
    }
  }
  return null;
}

function applyEffect(
  effect: PressureRuleEffect,
  workingFlags: Record<string, boolean>,
  stateDeltas: Array<Record<string, unknown>>,
): void {
  if (effect.type === "flag.set") {
    if (workingFlags[effect.key] === effect.value) return;
    workingFlags[effect.key] = effect.value;
    stateDeltas.push({
      op: "flag.set",
      kind: "flag.set",
      key: effect.key,
      value: effect.value,
      detail: effect.detail,
    });
    return;
  }

  if (effect.type === "modifier.set") {
    stateDeltas.push({
      op: "modifier.set",
      kind: "modifier.set",
      key: effect.key,
      value: effect.value,
      detail: effect.detail,
    });
    return;
  }

}

export const PRESSURE_RULES: PressureRuleDef[] = [
  {
    id: "GUARD_ALERTED_BY_NOISE_THRESHOLD",
    category: "pressure",
    when: [[{ type: "statAtLeast", key: "noise", value: 3 }]],
    effects: [
      {
        type: "flag.set",
        key: WORLD_FLAGS.guard.alerted,
        value: true,
        detail: "Noise makes the guard alert.",
      },
    ],
    ledger: {
      kind: "system.effect",
      cause: "noise threshold crossed",
      effect: "Guard is alerted",
      detail: "Noise makes the guard alert.",
    },
  },
  {
    id: "GUARD_SEARCHING_BY_ALERT_AND_NOISE",
    category: "pressure",
    when: [[
      { type: "flag", key: WORLD_FLAGS.guard.alerted, equals: true },
      { type: "statAtLeast", key: "noise", value: 3 },
    ]],
    effects: [
      {
        type: "flag.set",
        key: WORLD_FLAGS.guard.searching,
        value: true,
        detail: "Alerted guards begin searching.",
      },
    ],
    ledger: {
      kind: "system.effect",
      cause: "guard alerted",
      effect: "Guard begins searching",
      detail: "Alerted guards begin searching.",
    },
  },
  {
    id: "PLAYER_REVEALED_BY_SEARCH_AND_NOISE",
    category: "pressure",
    when: [[
      { type: "flag", key: WORLD_FLAGS.guard.searching, equals: true },
      { type: "statAtLeast", key: "noise", value: 3 },
    ]],
    effects: [
      {
        type: "flag.set",
        key: WORLD_FLAGS.player.revealed,
        value: true,
        detail: "Searchers expose your position.",
      },
    ],
    ledger: {
      kind: "system.effect",
      cause: "searching + high noise",
      effect: "Player is revealed",
      detail: "Searchers expose your position.",
    },
  },
  {
    id: "STATUS_EXPOSED_BY_PLAYER_REVEALED",
    category: "pressure",
    when: [[{ type: "flag", key: WORLD_FLAGS.player.revealed, equals: true }]],
    effects: [
      {
        type: "flag.set",
        key: WORLD_FLAGS.status.exposed,
        value: true,
        detail: "Revealed players can no longer duck cover.",
      },
    ],
    ledger: {
      kind: "system.effect",
      cause: "player revealed",
      effect: "Position is exposed",
      detail: "Revealed players can no longer duck cover.",
    },
  },
  {
    id: "STATUS_PRESSURE_EXPOSED_BY_DANGER_STAGE",
    category: "pressure",
    when: [[{ type: "stageCrosses", from: "tension", to: "danger" }]],
    effects: [
      {
        type: "flag.set",
        key: WORLD_FLAGS.status.pressureExposed,
        value: true,
        detail: "Pressure exposes your position.",
      },
    ],
    ledger: {
      kind: "system.effect",
      cause: "pressure reached danger",
      effect: "Position becomes exposed",
      detail: "Pressure exposes your position.",
    },
  },
  {
    id: "STEALTH_DIFFICULTY_BY_GUARD_SEARCHING",
    category: "modifier",
    when: [[{ type: "flag", key: WORLD_FLAGS.guard.searching, equals: true }]],
    effects: [
      {
        type: "modifier.set",
        key: "stealth.difficulty",
        value: 2,
        detail: "Searching guards make stealth more expensive.",
      },
    ],
    ledger: {
      kind: "system.effect",
      cause: "flag.guard.searching",
      effect: "stealth harder",
      detail: "Searching guards make stealth more expensive.",
    },
  },
  {
    id: "HIDE_DIFFICULTY_BY_STATUS_EXPOSED",
    category: "modifier",
    when: [[{ type: "flag", key: WORLD_FLAGS.status.exposed, equals: true }]],
    effects: [
      {
        type: "modifier.set",
        key: "hide.difficulty",
        value: 2,
        detail: "Exposure makes hiding require more effort.",
      },
    ],
    ledger: {
      kind: "system.effect",
      cause: "flag.status.exposed",
      effect: "hiding harder",
      detail: "Exposure makes hiding require more effort.",
    },
  },
  {
    id: "WAIT_CONSTRAINT_BY_GUARD_SEARCHING_OR_EXPOSED",
    category: "modifier",
    when: [
      [{ type: "flag", key: WORLD_FLAGS.guard.searching, equals: true }],
      [{ type: "flag", key: WORLD_FLAGS.status.exposed, equals: true }],
    ],
    effects: [
      {
        type: "flag.set",
        key: WORLD_FLAGS.pressure.actionConstraint,
        value: true,
        detail: "Constraint pressure is now active.",
      },
    ],
    ledger: {
      kind: "system.effect",
      cause: "flag.action.constraint_pressure",
      effect: "waiting no longer safe",
      detail: "Pressure constraints make waiting riskier.",
    },
  },
];

export function evaluatePressureRules(
  ctx: PressureRuleContext,
  rules: PressureRuleDef[] = PRESSURE_RULES,
  categories: PressureRuleCategory[] = ["pressure", "modifier"],
): PressureRuleResult {
  const workingFlags = cloneFlags(ctx.nextFlags);
  const stateDeltas: Array<Record<string, unknown>> = [];
  const ledgerAdds: Array<Record<string, unknown>> = [];
  const matchedRules: PressureRuleMatch[] = [];

  evaluateRuleSet({
    rules,
    context: {
      ...ctx,
      nextFlags: workingFlags,
    },
    includeRule: (rule) => categories.includes(rule.category),
    matchesRule: (rule, context) => matchesRule(rule, context),
    onMatch: (rule) => {
      matchedRules.push(rule);
      for (const effect of rule.effects) {
        applyEffect(effect, workingFlags, stateDeltas);
      }
      ledgerAdds.push({
        ...rule.ledger,
        ruleId: rule.id,
        matchedConditions: rule.matchedConditions,
      });
    },
  });
  return { stateDeltas, ledgerAdds, matchedRules };
}

export function summarizePressureTruth(matchedRules: PressureRuleMatch[]): PressureTruth | null {
  if (!matchedRules.length) return null;
  return {
    rulesTriggered: matchedRules.map((rule) => ({
      ruleId: rule.id,
      matchedConditions: rule.matchedConditions,
      effects: rule.effects,
    })),
  };
}
