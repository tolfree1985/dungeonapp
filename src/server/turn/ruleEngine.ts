export type RuleMatch<TRule, TCondition> = TRule & {
  matchedConditions: TCondition[];
};

export function evaluateRuleSet<TContext, TRule extends { id: string }, TCondition>(params: {
  rules: TRule[];
  context: TContext;
  matchesRule: (rule: TRule, context: TContext) => TCondition[] | null;
  includeRule?: (rule: TRule) => boolean;
  onMatch?: (match: RuleMatch<TRule, TCondition>, context: TContext) => boolean | void;
}): Array<RuleMatch<TRule, TCondition>> {
  const matches: Array<RuleMatch<TRule, TCondition>> = [];
  for (const rule of params.rules) {
    if (params.includeRule && !params.includeRule(rule)) continue;
    const matchedConditions = params.matchesRule(rule, params.context);
    if (!matchedConditions) continue;
    const match = {
      ...rule,
      matchedConditions,
    };
    matches.push(match);
    if (params.onMatch?.(match, params.context) === false) {
      break;
    }
  }
  return matches;
}
