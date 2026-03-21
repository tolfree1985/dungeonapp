"use client";

import type { LedgerEntryViewModel } from "./presenters";
import { cardPadding, cardShell, emptyState, sectionHeading } from "./cardStyles";

type LedgerPanelProps = {
  entries?: LedgerEntryViewModel[];
};

const categoryLabels: Record<string, string> = {
  pressure: "State",
  world: "World",
  quest: "Quest",
  inventory: "Inventory",
  npc: "NPC",
  time: "Time",
};

export default function LedgerPanel({ entries = [] }: LedgerPanelProps) {
  return (
    <section className={`${cardShell} ${cardPadding} space-y-4`}>
      <div className={sectionHeading}>Ledger</div>
      <div className="space-y-3">
        {entries.length === 0 ? (
          <div className={emptyState}>No ledger entries recorded.</div>
        ) : (
          entries.map((entry) => (
            <article
              key={entry.id}
              className="space-y-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-200"
            >
              <div className="flex items-center justify-between text-xs text-white/70">
                <span>{categoryLabels[entry.category] ?? "World"}</span>
                <span className="font-semibold text-white">{entry.effect ? "Caused" : "Observed"}</span>
              </div>
              <div className="text-sm font-semibold text-white">
                {entry.cause}
                {entry.effect ? ` → ${entry.effect}` : ""}
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
