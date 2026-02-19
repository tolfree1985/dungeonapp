type AnyPayload = Record<string, unknown> | null | undefined;

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function mapCreatorErrorMessage(args: {
  status: number;
  payload: AnyPayload;
}): string {
  const topLevel = asString(args.payload?.error);
  const nested = asString(args.payload?.code);
  const code = nested || topLevel;

  if (args.status === 429 && code === "RATE_LIMITED") {
    return "Rate limited. Try again later.";
  }
  if (args.status === 429 && code === "SCENARIO_CAP_EXCEEDED") {
    return "Scenario cap reached for this owner.";
  }
  if (args.status === 429 && code === "MONTHLY_TOKEN_CAP_EXCEEDED") {
    return "Monthly token cap exceeded.";
  }
  if (args.status === 429 && (code === "CONCURRENCY_LIMIT_EXCEEDED" || code === "CONCURRENCY_LIMIT")) {
    return "Another request is already in progress.";
  }
  if (args.status === 429 && (code === "PER_TURN_OUTPUT_CAP_EXCEEDED" || code === "OUTPUT_CAP_EXCEEDED")) {
    return "Per-turn output cap exceeded.";
  }
  if (args.status === 429 && code === "TURN_CAP") {
    return "Turn cap reached for this tier.";
  }
  if (args.status === 429 && code === "REGEN_CAP") {
    return "Regen cap reached for this tier.";
  }

  return "Request failed.";
}
