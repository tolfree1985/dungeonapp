import type { ConsequenceEntry } from "@/server/scene/consequence-bundle";

export type LedgerPresentationEntry = {
  id: string;
  kind: ConsequenceEntry["kind"];
  text: string;
};

/**
 * Ledger presentation is a deterministic projection of consequence entries
 * and must use ledgerText only. Scene narration text must never be reused for ledger rendering.
 */
export function projectLedgerEntries(entries: ConsequenceEntry[]): LedgerPresentationEntry[] {
  return entries.map((entry) => ({
    id: entry.id,
    kind: entry.kind,
    text: entry.ledgerText,
  }));
}
