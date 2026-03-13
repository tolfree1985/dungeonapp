"use client";

import { useMemo, useState } from "react";
import type { LatestTurnViewModel } from "./presenters";
import { cardPadding, cardShell, cardSpacing, emptyState, metadataTag, sectionHeading } from "./cardStyles";

const consequenceLabel: Record<string, string> = {
  pressure: "Pressure",
  world: "World",
  quest: "Quest",
  inventory: "Inventory",
  npc: "NPC",
  time: "Time",
};

type Props = {
  model: LatestTurnViewModel | null;
  isHighlighted?: boolean;
};

export default function LatestTurnCard({ model, isHighlighted }: Props) {
  const hasResolvedTurn = Boolean(model && model.turnIndex && model.turnIndex > 0);
  const highlightClass = isHighlighted
    ? "ring-1 ring-amber-400/60 shadow-[0_0_35px_rgba(250,204,61,0.45)]"
    : "";
  if (!hasResolvedTurn) {
    return (
      <section className={`${cardShell} ${cardPadding} ${cardSpacing} ${highlightClass}`}>
        <div className={sectionHeading}>Latest Turn</div>
        <h2 className="text-2xl font-semibold text-white">No resolved turn yet.</h2>
        <p className="text-sm text-white/60">
          Submit a command to record the next turn. The scene, outcome, and consequences appear once the action resolves.
        </p>
        <div className={emptyState}>Awaiting resolved turn.</div>
      </section>
    );
  }

  const ledgerEntries = model?.ledgerEntries ?? [];
  const stateDeltas = model?.stateDeltas ?? [];
  const [showAllConsequences, setShowAllConsequences] = useState(false);
  const consequences = useMemo(() => {
    const entries = ledgerEntries.map((entry) => ({
      id: entry.id,
      text: `${consequenceLabel[entry.category] ?? "World"} — ${entry.cause}${entry.effect ? ` → ${entry.effect}` : ""}`,
    }));
    const deltas = stateDeltas.map((delta, index) => ({
      id: `${delta.key}-${delta.value}-${index}`,
      text: `${delta.key}: ${delta.value}`,
    }));
    return [...entries, ...deltas];
  }, [ledgerEntries, stateDeltas]);
  const hasConsequences = consequences.length > 0;
  const visibleConsequences = showAllConsequences ? consequences : consequences.slice(0, 2);

  return (
    <section className={`${cardShell} ${cardPadding} ${cardSpacing} ${highlightClass}`}> 
      <header className="space-y-2">
        <div className={sectionHeading}>Latest Turn</div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-3xl font-semibold text-white">Turn {model?.turnIndex ?? "—"}</p>
          {model?.mode ? (
            <span className="rounded-full border border-white/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.35em] text-white/70">
              {model.mode}
            </span>
          ) : null}
          <span className={`${metadataTag} ml-auto text-white/60`}>Pressure: {model?.pressureLabel ?? "CALM"}</span>
        </div>
      </header>

      <div className="space-y-6">
        <div className="space-y-3 border-b border-white/5 pb-4">
          <div className={sectionHeading}>Command</div>
          <p className="text-lg font-semibold text-white">{model?.playerInput ?? "Command missing"}</p>
        </div>
        <div className="space-y-3 border-b border-white/5 pb-4">
          <div className={sectionHeading}>Scene</div>
          <p className="text-sm text-slate-300">{model?.sceneText ?? "Scene text unavailable"}</p>
        </div>
        <div className="space-y-2 border-b border-white/5 pb-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-200">Resolution</div>
          <div className="rounded-[14px] border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.28em] text-amber-100 shadow-[0_0_25px_rgba(250,204,61,0.15)]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-amber-200">{model?.rollSummary ?? "Roll pending"}</span>
              <span className="opacity-40">•</span>
              <span className="text-white/80">{(model?.outcomeTierLabel ?? model?.outcomeLabel ?? "Resolution pending").toUpperCase()}</span>
              {model?.intentLabel ? (
                <>
                  <span className="opacity-40">•</span>
                  <span className="text-white/70">{model.intentLabel.toUpperCase()}</span>
                </>
              ) : null}
            </div>
          </div>
        </div>
        {model?.notesLabel ? (
          <div className="space-y-2 border-b border-white/5 pb-4">
            <div className={sectionHeading}>Notes</div>
            <p className="text-sm text-white/60">{model.notesLabel}</p>
          </div>
        ) : null}
      </div>

      <div className="mt-6 border-t border-white/5 pt-4">
        <div className={sectionHeading}>Consequences</div>
        <ul className="mt-3 space-y-2">
          {visibleConsequences.map((entry) => (
            <li key={entry.id} className="text-sm text-slate-200">
              {entry.text}
            </li>
          ))}
          {!hasConsequences && (
            <li className={emptyState}>No consequences were recorded for this turn.</li>
          )}
        </ul>
        {consequences.length > 2 ? (
          <button
            type="button"
            onClick={() => setShowAllConsequences((prev) => !prev)}
            className="mt-2 text-xs font-semibold uppercase tracking-[0.3em] text-amber-300"
          >
            {showAllConsequences
              ? "Show fewer consequences"
              : `+${consequences.length - 2} more consequences`}
          </button>
        ) : null}
      </div>
    </section>
  );
}
