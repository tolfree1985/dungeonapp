import { evaluateRuleSet } from "@/server/turn/ruleEngine";
import type { FinalizedEffectSummary } from "@/lib/finalized-effects";
import type { OpportunityWindowState } from "@/lib/opportunity-window";
import type { OpportunityBenefit, OpportunityQuality } from "@/lib/opportunity-window-state";
import type { IntentMode } from "@/lib/watchfulness-action-flags";
import { WORLD_FLAGS } from "@/lib/engine/worldFlags";

export type OpportunityRuleCondition =
  | { type: "intentMode"; mode: IntentMode }
  | { type: "inputIncludes"; value: string }
  | { type: "sceneTextIncludes"; value: string }
  | { type: "effectSummaryIncludes"; value: FinalizedEffectSummary }
  | { type: "flag"; key: string; equals: boolean }
  | { type: "flagAbsent"; key: string }
  | { type: "sceneClockAtLeast"; value: number };

export type OpportunityRuleEffect =
  | { type: "window.set"; windowNarrowed: boolean; opportunityTier: OpportunityWindowState["opportunityTier"]; detail: string }
  | { type: "ledger"; cause: string; effect: string; detail: string };

export type OpportunityRuleDef = {
  id: string;
  when: OpportunityRuleCondition[][];
  effects: OpportunityRuleEffect[];
};

export type OpportunityRuleContext = {
  intentMode: IntentMode;
  normalizedInput: string;
  sceneText: string;
  effectSummaries: FinalizedEffectSummary[];
  stateFlags?: Record<string, unknown>;
  sceneClock: number;
};

export type OpportunityRuleMatch = OpportunityRuleDef & {
  matchedConditions: OpportunityRuleCondition[];
};

export type OpportunityTruthRule = {
  ruleId: string;
  matchedConditions: OpportunityRuleCondition[];
  effects: OpportunityRuleEffect[];
};

export type OpportunityTruth = {
  rulesTriggered: OpportunityTruthRule[];
  benefit?: OpportunityBenefit | null;
  quality?: OpportunityQuality | null;
};

export type OpportunityRuleResult = {
  opportunityWindowState: OpportunityWindowState;
  ledgerAdds: Array<Record<string, unknown>>;
  matchedRules: OpportunityRuleMatch[];
  opportunityTruth: OpportunityTruth | null;
};

const OPPORTUNITY_RULES: OpportunityRuleDef[] = [
  {
    id: "OPPORTUNITY_WINDOW_REDUCED_BY_FINALIZED_EFFECTS",
    when: [[{ type: "effectSummaryIncludes", value: "objective.window-narrowed" }]],
    effects: [
      {
        type: "window.set",
        windowNarrowed: true,
        opportunityTier: "reduced",
        detail: "The finalized scene effects narrow the opportunity window.",
      },
      {
        type: "ledger",
        cause: "opportunity.window-pressure",
        effect: "opportunity.window-narrowed",
        detail: "The situation closes down the available margin.",
      },
    ],
  },
  {
    id: "OPPORTUNITY_WINDOW_REDUCED_BY_TIME_PRESSURE",
    when: [[{ type: "sceneClockAtLeast", value: 6 }]],
    effects: [
      {
        type: "window.set",
        windowNarrowed: true,
        opportunityTier: "reduced",
        detail: "Time pressure narrows the opportunity window.",
      },
      {
        type: "ledger",
        cause: "time pressure",
        effect: "opportunity.window-narrowed",
        detail: "Lingering too long reduces the room for advantage.",
      },
    ],
  },
  {
    id: "SHADOW_HIDE_OPPORTUNITY",
    when: [[
      { type: "intentMode", mode: "DO" },
      { type: "inputIncludes", value: "hide" },
      { type: "sceneTextIncludes", value: "shadow" },
      { type: "flagAbsent", key: WORLD_FLAGS.status.exposed },
      { type: "flagAbsent", key: WORLD_FLAGS.player.revealed },
      { type: "flagAbsent", key: WORLD_FLAGS.guard.searching },
    ]],
    effects: [
      {
        type: "window.set",
        windowNarrowed: false,
        opportunityTier: "normal",
        detail: "Deep shadows make concealment easier.",
      },
      {
        type: "ledger",
        cause: "deep shadow",
        effect: "concealment improved",
        detail: "The shadows make concealment easier.",
      },
    ],
  },
  {
    id: "HIDDEN_STATE_CONCEALMENT_OPPORTUNITY",
    when: [[
      { type: "intentMode", mode: "DO" },
      { type: "inputIncludes", value: "hide" },
      { type: "flag", key: WORLD_FLAGS.status.hidden, equals: true },
      { type: "flag", key: WORLD_FLAGS.status.exposed, equals: false },
      { type: "flag", key: WORLD_FLAGS.player.revealed, equals: false },
      { type: "flag", key: WORLD_FLAGS.guard.searching, equals: false },
    ]],
    effects: [
      {
        type: "window.set",
        windowNarrowed: false,
        opportunityTier: "normal",
        detail: "Being hidden opens a concealment opportunity.",
      },
      {
        type: "ledger",
        cause: "status.hidden",
        effect: "concealment improved",
        detail: "Hidden cover remains available as an advantage.",
      },
    ],
  },
  {
    id: "HIDE_BASELINE_OPPORTUNITY",
    when: [[
      { type: "intentMode", mode: "DO" },
      { type: "inputIncludes", value: "hide" },
      { type: "flagAbsent", key: WORLD_FLAGS.status.exposed },
      { type: "flagAbsent", key: WORLD_FLAGS.player.revealed },
      { type: "flagAbsent", key: WORLD_FLAGS.guard.searching },
    ]],
    effects: [
      {
        type: "window.set",
        windowNarrowed: false,
        opportunityTier: "normal",
        detail: "Hiding creates a concealment opportunity.",
      },
      {
        type: "ledger",
        cause: "hide.action",
        effect: "concealment improved",
        detail: "Hiding creates a chance to act from concealment.",
      },
    ],
  },
];

export { OPPORTUNITY_RULES };

type OpportunityMatch = OpportunityRuleMatch;

function matchesCondition(condition: OpportunityRuleCondition, ctx: OpportunityRuleContext): boolean {
  switch (condition.type) {
    case "intentMode":
      return ctx.intentMode === condition.mode;
    case "inputIncludes":
      return ctx.normalizedInput.includes(condition.value);
    case "sceneTextIncludes":
      return ctx.sceneText.includes(condition.value);
    case "effectSummaryIncludes":
      return ctx.effectSummaries.includes(condition.value);
    case "flag":
      return (ctx.stateFlags?.[condition.key] ?? false) === condition.equals;
    case "flagAbsent":
      return !(ctx.stateFlags?.[condition.key] ?? false);
    case "sceneClockAtLeast":
      return ctx.sceneClock >= condition.value;
    default:
      return false;
  }
}

function matchesRule(rule: OpportunityRuleDef, ctx: OpportunityRuleContext): OpportunityRuleCondition[] | null {
  for (const group of rule.when) {
    if (group.every((condition) => matchesCondition(condition, ctx))) {
      return group;
    }
  }
  return null;
}

function inferOpportunityQuality(matchedRules: OpportunityRuleMatch[], ctx: OpportunityRuleContext): OpportunityQuality | null {
  if (matchedRules.length === 0) return null;

  const hiddenConcealmentRuleMatched = matchedRules.some((rule) =>
    rule.id === "HIDDEN_STATE_CONCEALMENT_OPPORTUNITY" ||
    rule.id === "HIDDEN_STATE_CONCEALMENT_OPPORTUNITY_CONTESTED" ||
    rule.id === "SHADOW_HIDE_OPPORTUNITY",
  );
  if (!hiddenConcealmentRuleMatched) {
    return "clean";
  }

  const flags = ctx.stateFlags ?? {};
  const contested =
    Boolean(flags[WORLD_FLAGS.status.exposed]) ||
    Boolean(flags[WORLD_FLAGS.player.revealed]) ||
    Boolean(flags[WORLD_FLAGS.guard.searching]);
  return contested ? "contested" : "clean";
}

function applyEffects(
  effect: OpportunityRuleEffect,
  currentWindow: OpportunityWindowState,
  ledgerAdds: Array<Record<string, unknown>>,
): OpportunityWindowState {
  if (effect.type === "window.set") {
    return {
      windowNarrowed: effect.windowNarrowed,
      opportunityTier: effect.opportunityTier,
    };
  }
  ledgerAdds.push({
    kind: "opportunity.window-state",
    cause: effect.cause,
    effect: effect.effect,
    detail: effect.detail,
  });
  return currentWindow;
}

export function evaluateOpportunityRules(
  ctx: OpportunityRuleContext,
  rules: OpportunityRuleDef[] = OPPORTUNITY_RULES,
): OpportunityRuleResult {
  let opportunityWindowState: OpportunityWindowState = { windowNarrowed: false, opportunityTier: "normal" };
  const ledgerAdds: Array<Record<string, unknown>> = [];
  const matchedRules: OpportunityRuleMatch[] = [];

  evaluateRuleSet({
    rules,
    context: ctx,
    includeRule: () => true,
    matchesRule: (rule, context) => matchesRule(rule, context),
    onMatch: (rule) => {
      matchedRules.push(rule);
      for (const effect of rule.effects) {
        opportunityWindowState = applyEffects(effect, opportunityWindowState, ledgerAdds);
      }
    },
  });

  return {
    opportunityWindowState,
    ledgerAdds,
    matchedRules,
    opportunityTruth: matchedRules.length
      ? {
          rulesTriggered: matchedRules.map((rule) => ({
            ruleId: rule.id,
            matchedConditions: rule.matchedConditions,
            effects: rule.effects,
          })),
          quality: inferOpportunityQuality(matchedRules, ctx),
        }
      : null,
  };
}
