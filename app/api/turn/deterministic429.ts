export type BudgetExceeded429Payload = {
  error: "BUDGET_EXCEEDED";
  code: string;
} & Record<string, unknown>;

export function buildBudgetExceeded429Payload(args: {
  code: string;
  extras?: Record<string, unknown>;
}): BudgetExceeded429Payload {
  return {
    error: "BUDGET_EXCEEDED",
    code: args.code,
    ...(args.extras ?? {}),
  };
}
