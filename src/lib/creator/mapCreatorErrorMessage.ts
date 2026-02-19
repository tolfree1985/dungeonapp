type AnyPayload = Record<string, unknown> | null | undefined;

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function formatCreatorCapDetail(payload: AnyPayload): string {
  const cap = asFiniteNumber(payload?.cap);
  const used = asFiniteNumber(payload?.used);
  const reserved = asFiniteNumber(payload?.reserved);

  if (cap == null && used == null && reserved == null) {
    return "";
  }

  const parts: string[] = [];
  if (cap != null) parts.push(`cap=${cap}`);
  if (used != null) parts.push(`used=${used}`);
  if (reserved != null) parts.push(`reserved=${reserved}`);
  return parts.join(" ");
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

export function formatCreatorRetryAfterText(args: {
  status: number;
  payload: AnyPayload;
  retryAfterHeader: string | null;
}): string {
  const topLevel = asString(args.payload?.error);
  const nested = asString(args.payload?.code);
  const code = nested || topLevel;

  if (args.status !== 429 || code !== "RATE_LIMITED") {
    return "";
  }

  if (args.retryAfterHeader && args.retryAfterHeader.trim()) {
    return `Retry-After: ${args.retryAfterHeader.trim()}`;
  }

  return "Retry-After: unavailable";
}
