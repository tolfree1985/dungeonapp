"use client";

import { ui } from "@/lib/ui/classes";
import type { LatestTurnViewModel } from "./presenters";

type Props = {
  model: LatestTurnViewModel | null;
};

export default function LatestTurnCard({ model }: Props) {
  const hasResolvedTurn = Boolean(model && model.turnIndex && model.turnIndex > 0);
  const isEmpty = !hasResolvedTurn;

  if (isEmpty) {
    return (
      <section className={`${ui.panel} space-y-4 p-6`}>
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">Awaiting resolved turn</div>
        <h2 className="text-2xl font-semibold text-white">No scene has been resolved yet</h2>
        <p className="text-sm leading-6 text-slate-400">
          Submit a command to resolve the next turn. The scene, outcome, and ledger entries will appear once
          your action has been processed.
        </p>
      </section>
    );
  }

  const legacyLedgerEntries = model?.ledgerEntries ?? [];
  const stateDeltas = model?.stateDeltas ?? [];
  const hasConsequences = legacyLedgerEntries.length > 0 || stateDeltas.length > 0;

  return (
    <section className={`${ui.panel} space-y-6 p-6`}>
      <header className="flex flex-wrap items-center gap-3 border-b border-white/10 pb-3">
        <div className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
          Turn {model?.turnIndex ?? "—"}
        </div>
        {model?.mode ? (
          <span className="rounded-full border border-slate-200/60 px-3 py-1 text-[11px] font-semibold uppercase text-slate-500">
            {model.mode}
          </span>
        ) : null}
        <span className="ml-auto text-xs font-semibold uppercase tracking-[0.3em] text-amber-200">
          Pressure: {model?.pressureLabel ?? "CALM"}
        </span>
      </header>

      <div className="space-y-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">Player command</div>
          <p className="text-lg font-semibold text-white">
            {model?.playerInput ?? "No command recorded"}
          </p>
        </div>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">Scene</div>
          <p className="text-sm text-slate-300">{model?.sceneText ?? "Scene text unavailable"}</p>
        </div>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">Outcome</div>
          <p className="text-sm text-amber-200">{model?.outcomeLabel ?? "Outcome pending"}</p>
        </div>
      </div>

      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">Consequences</div>
        <ul className="mt-3 space-y-2">
          {legacyLedgerEntries.map((entry, index) => (
            <li key={`ledger-${index}`} className="text-sm text-slate-200">
              {entry}
            </li>
          ))}
          {stateDeltas.map((delta) => (
            <li key={`${delta.key}-${delta.value}`} className="text-sm text-slate-200">
              <span className="font-semibold text-slate-100">{delta.key}:</span> {delta.value}
            </li>
          ))}
          {!hasConsequences && (
            <li className="text-sm text-slate-400">No consequences were recorded for this turn.</li>
          )}
        </ul>
      </div>
    </section>
  );
}
