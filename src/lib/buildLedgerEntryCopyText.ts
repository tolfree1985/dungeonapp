type AnyRecord = Record<string, unknown>;

/**
 * Pure deterministic text builder for a causal-ledger entry.
 * - Includes key fields if present (message/because/kind/refEventId/ruleId/source) + raw JSON.
 * - No timestamps, no randomness.
 * - Fixed field ordering.
 */
export function buildLedgerEntryCopyText(entry: AnyRecord): string {
  const lines: string[] = [];

  const pushIf = (label: string, key: string) => {
    const v = entry[key];
    if (v === undefined || v === null) return;
    if (typeof v === "string" && v.length === 0) return;
    lines.push(`${label}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
  };

  pushIf("message", "message");
  pushIf("because", "because");
  pushIf("kind", "kind");
  pushIf("refEventId", "refEventId");
  pushIf("ruleId", "ruleId");
  pushIf("source", "source");

  lines.push("");
  lines.push("raw:");
  lines.push(JSON.stringify(entry, null, 2));

  return lines.join("\n");
}
