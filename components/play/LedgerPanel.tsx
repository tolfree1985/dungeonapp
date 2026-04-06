"use client";

import { useState } from "react";
import type { LedgerEntryViewModel } from "./presenters";
import { cardPadding, cardShell, emptyState, sectionHeading } from "./cardStyles";
import type { LedgerEntry } from "@/lib/engine/resolveTurnContract";

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
  const [showFullLedger, setShowFullLedger] = useState(false);
  const visibleEntries = entries.slice(0, 5);
  const hiddenEntries = entries.slice(5);
  return (
    <section className={`${cardShell} ${cardPadding} space-y-4`}>
      <div className={sectionHeading}>Ledger</div>
      <div className="space-y-3">
        {entries.length === 0 ? (
          <div className={emptyState}>No ledger entries recorded.</div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-2">
              {visibleEntries.map((entry) => (
                <article
                  key={entry.id}
                  className="space-y-2 rounded-2xl border border-white/5 bg-black/30 px-4 py-3 text-left"
                >
                  <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.3em] text-white/60">
                    <span>{categoryLabels[entry.category] ?? "World"}</span>
                    <span>{entry.effect ? "Caused" : "Observed"}</span>
                  </div>
                  <p className="text-sm font-semibold text-white leading-snug">{entry.cause}</p>
                  {entry.effect ? <p className="text-xs text-white/60">{entry.effect}</p> : null}
                </article>
              ))}
            </div>
            {hiddenEntries.length > 0 ? (
              <button
                type="button"
                onClick={() => setShowFullLedger((v) => !v)}
                className="text-xs text-zinc-500 hover:text-zinc-300"
              >
                {showFullLedger ? "Hide simulation details" : "Show simulation details"}
              </button>
            ) : null}
            {showFullLedger && hiddenEntries.length > 0 && (
              <div className="space-y-3 pt-2">
                {hiddenEntries.map((entry) => (
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
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
