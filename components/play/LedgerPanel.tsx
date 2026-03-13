"use client";

import { ui } from "@/lib/ui/classes";
import type { LedgerEntryViewModel } from "./presenters";

type LedgerPanelProps = {
  entries?: LedgerEntryViewModel[];
};

const categoryLabels: Record<string, string> = {
  pressure: "Pressure",
  world: "World",
  quest: "Quest",
  inventory: "Inventory",
  npc: "NPC",
  time: "Time",
};

const emphasisTone: Record<"normal" | "high", string> = {
  normal: "border-white/10 bg-black/10",
  high: "border-rose-400/40 bg-rose-500/10",
};

export default function LedgerPanel({ entries = [] }: LedgerPanelProps) {
  if (entries.length === 0) return null;

  return (
    <div className={`${ui.panel} p-5`}>
      <div className={ui.sectionLabel}>Ledger</div>
      <div className="mt-4 space-y-3">
        {entries.map((entry) => (
          <article
            key={entry.id}
            className={`space-y-2 rounded-[18px] border px-3 py-2 ${entry.emphasis ? emphasisTone[entry.emphasis] : "border-white/10 bg-black/10"}`}
          >
            <div className="flex items-center justify-between text-sm">
              <span className="text-[#a59e90]">{categoryLabels[entry.category] ?? "World"}</span>
              <span className="font-medium text-[#f3efe6]">
                {entry.effect ? `${entry.cause} → ${entry.effect}` : entry.cause}
              </span>
            </div>
            {entry.effect ? (
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                {entry.category}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}
