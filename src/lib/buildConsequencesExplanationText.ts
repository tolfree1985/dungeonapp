import { formatConsequenceValue } from "./formatConsequenceValue";

type BuildConsequencesExplanationTextInput = {
  stateDeltas?: readonly unknown[];
  ledgerAdds?: readonly unknown[];
  maxLen?: number;
};

const BEFORE_KEYS = ["before", "from", "oldValue", "previous", "prev"] as const;
const AFTER_KEYS = ["after", "to", "newValue", "next", "value"] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function firstDefined(
  input: Record<string, unknown> | null,
  keys: readonly string[],
): unknown {
  if (!input) return undefined;
  for (const key of keys) {
    if (key in input) return input[key];
  }
  return undefined;
}

function normalizeMaxLen(maxLen: number | undefined): number {
  if (typeof maxLen !== "number" || !Number.isFinite(maxLen)) return 160;
  return maxLen;
}

function formatDeltaLine(delta: unknown, index: number, maxLen: number): string {
  const row = asRecord(delta);
  const path = typeof row?.path === "string" && row.path.length > 0 ? row.path : `#${index + 1}`;
  const op = typeof row?.op === "string" ? row.op : null;
  const before = firstDefined(row, BEFORE_KEYS);
  const after = firstDefined(row, AFTER_KEYS);
  const opText = op ? ` (${op})` : "";
  return `${index + 1}. ${path}${opText}: ${formatConsequenceValue(before, maxLen)} -> ${formatConsequenceValue(after, maxLen)}`;
}

function formatLedgerLine(entry: unknown, index: number, maxLen: number): string {
  const row = asRecord(entry);
  const kind = typeof row?.kind === "string"
    ? row.kind
    : typeof row?.type === "string"
      ? row.type
      : null;
  const message = typeof row?.message === "string"
    ? row.message
    : typeof row?.summary === "string"
      ? row.summary
      : null;
  const because = typeof row?.because === "string" ? row.because : null;

  const parts: string[] = [];
  if (message) parts.push(`message=${formatConsequenceValue(message, maxLen)}`);
  if (because) parts.push(`because=${formatConsequenceValue(because, maxLen)}`);
  if (kind) parts.push(`kind=${formatConsequenceValue(kind, maxLen)}`);

  if (parts.length > 0) return `${index + 1}. ${parts.join(" | ")}`;
  return `${index + 1}. ${formatConsequenceValue(entry, maxLen)}`;
}

export function buildConsequencesExplanationText(
  input: BuildConsequencesExplanationTextInput,
): string {
  const deltas = Array.isArray(input.stateDeltas) ? input.stateDeltas : [];
  const ledger = Array.isArray(input.ledgerAdds) ? input.ledgerAdds : [];
  const maxLen = normalizeMaxLen(input.maxLen);

  const lines: string[] = [];

  lines.push(`State Deltas (${deltas.length}):`);
  if (deltas.length === 0) {
    lines.push("None.");
  } else {
    for (let i = 0; i < deltas.length; i += 1) {
      lines.push(formatDeltaLine(deltas[i], i, maxLen));
    }
  }

  lines.push("");
  lines.push(`Causal Ledger (${ledger.length}):`);
  if (ledger.length === 0) {
    lines.push("None.");
  } else {
    for (let i = 0; i < ledger.length; i += 1) {
      lines.push(formatLedgerLine(ledger[i], i, maxLen));
    }
  }

  return lines.join("\n");
}

