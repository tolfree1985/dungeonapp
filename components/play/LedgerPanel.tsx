"use client";

import { ui } from "@/lib/ui/classes";
import type { LedgerDisplayEntry } from "./presenters";

type LedgerPanelProps = {
  entries?: LedgerDisplayEntry[];
};

export default function LedgerPanel({ entries = [] }: LedgerPanelProps) {
  if (entries.length === 0) return null;

  return (
    <div className={`${ui.panel} p-5`}>
      <div className={ui.sectionLabel}>Ledger</div>
      <div className="mt-4 space-y-3">
        {entries.map((entry, index) => (
          <article key={`${entry.cause}-${index}`} className="space-y-2 rounded-[18px] border border-white/10 bg-black/10 p-3">
            {entry.cause ? (
              <div className="flex items-center justify-between text-sm">
                <span className="text-[#a59e90]">Cause</span>
                <span className="font-medium text-[#f3efe6]">{entry.cause}</span>
              </div>
            ) : null}
            {entry.effects.length > 0 ? (
              <div className="flex items-center justify-between text-sm">
                <span className="text-[#a59e90]">Effect</span>
                <span className="font-medium text-[#f3efe6]">{entry.effects.join(", ")}</span>
              </div>
            ) : null}
            {entry.effects.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {entry.effects.map((chip) => (
                  <span key={chip} className="hud-chip text-[#d8d2c3] bg-white/5 border-white/10">
                    {chip}
                  </span>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}
