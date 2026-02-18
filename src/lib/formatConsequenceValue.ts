const TRUNCATION_SUFFIX = "…(truncated)";

function truncate(input: string, maxLen: number): string {
  if (input.length <= maxLen) return input;
  const cutoff = Math.max(0, maxLen);
  return `${input.slice(0, cutoff)}${TRUNCATION_SUFFIX}`;
}

export function formatConsequenceValue(value: unknown, maxLen = 160): string {
  if (typeof value === "string") {
    return truncate(value, maxLen);
  }

  if (value !== null && typeof value === "object") {
    try {
      return truncate(JSON.stringify(value), maxLen);
    } catch {
      return truncate(String(value), maxLen);
    }
  }

  return truncate(String(value), maxLen);
}
