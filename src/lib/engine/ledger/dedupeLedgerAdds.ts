export type LedgerLikeEntry = Record<string, unknown>;

function asRecord(value: unknown): LedgerLikeEntry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as LedgerLikeEntry;
}

export function dedupeLedgerAdds<T extends LedgerLikeEntry>(ledgerAdds: T[]): T[] {
  const seen = new Set<string>();
  return ledgerAdds.filter((entry) => {
    const record = asRecord(entry);
    if (!record) return true;
    const fireTarget =
      asRecord(record.data)?.fire && typeof asRecord(record.data)?.fire === "object"
        ? (asRecord(record.data)?.fire as LedgerLikeEntry)?.targetKey ?? null
        : null;
    const key = JSON.stringify({
      kind: record.kind ?? null,
      cause: record.cause ?? null,
      effect: record.effect ?? null,
      target: fireTarget ?? null,
    });
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
