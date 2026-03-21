"use client";

import { useState } from "react";
import type { LedgerPresentationEntry } from "@/server/scene/ledger-presentation";

type ConsequenceLedgerListProps = {
  entries: LedgerPresentationEntry[];
  resolutionRollLabel?: string | null;
  rollDetail?: string | null;
};

const ledgerEntryClasses: Record<LedgerPresentationEntry["kind"], string> = {
  primary: "border border-white/10 bg-white/5 text-white/80",
  complication: "border border-amber-500/20 bg-amber-500/10 text-amber-100",
  cost: "border border-rose-500/20 bg-rose-500/10 text-rose-100",
};

export function ConsequenceLedgerList({ entries, resolutionRollLabel, rollDetail }: ConsequenceLedgerListProps) {
  const sanitizedRollDetail = rollDetail?.replace(/^Dice:\s*/i, "");
  const hasRollInfo = Boolean(resolutionRollLabel || sanitizedRollDetail);
  const hasEntries = entries.length > 0;
  if (!hasEntries && !hasRollInfo) return null;
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.35em] text-white/30">
        <span>Details</span>
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="text-[11px] text-white/40 transition hover:text-white/60"
        >
          {open ? "Hide details" : "Show details"}
        </button>
      </div>
      {/* Ledger UI may style by kind, but must render persisted ledgerEntries in canonical order and not rewrite text. */}
      {open &&
        (resolutionRollLabel || sanitizedRollDetail) && (
          <div
            data-testid="details-roll-info"
            className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/50"
          >
            {resolutionRollLabel ? <span>{resolutionRollLabel}</span> : null}
            {sanitizedRollDetail ? <span className="ml-2 text-white/40">({sanitizedRollDetail})</span> : null}
          </div>
        )}
      {open &&
        entries.map((entry) => (
          <div
            key={entry.id}
            data-testid="consequence-ledger-entry"
            className={`rounded-lg px-3 py-1.5 text-[11px] tracking-[0.25em] ${ledgerEntryClasses[entry.kind]} text-white/60`}
          >
            {entry.text}
          </div>
        ))}
    </div>
  );
}
