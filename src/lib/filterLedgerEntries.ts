type AnyRecord = Record<string, unknown>;

export type LedgerFilter = {
  kind?: string;
  ruleId?: string;
};

export function filterLedgerEntries(
  entries: AnyRecord[],
  filter: LedgerFilter,
): AnyRecord[] {
  const kind = (filter.kind ?? "").trim();
  const ruleId = (filter.ruleId ?? "").trim().toLowerCase();

  return entries.filter((e) => {
    if (kind) {
      const ek = e["kind"];
      if (typeof ek !== "string" || ek !== kind) return false;
    }
    if (ruleId) {
      const rid = e["ruleId"];
      const s = typeof rid === "string" ? rid : "";
      if (!s.toLowerCase().includes(ruleId)) return false;
    }
    return true;
  });
}
