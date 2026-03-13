"use client";

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
};

export default function LatestTurnCard({ model }: Props) {
  const hasResolvedTurn = Boolean(model && model.turnIndex && model.turnIndex > 0);
  const showTierLabel =
    Boolean(model?.outcomeTierLabel) &&
    Boolean(model?.outcomeLabel) &&
    model.outcomeTierLabel.toLowerCase() !== model.outcomeLabel.toLowerCase();

  if (!hasResolvedTurn) {
    return (
      <section className={`${cardShell} ${cardPadding} ${cardSpacing}`}>
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
  const hasConsequences = ledgerEntries.length > 0 || stateDeltas.length > 0;

  return (
    <section className={`${cardShell} ${cardPadding} ${cardSpacing}`}>
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
        {model?.rollSummary ? (
          <div className="space-y-2 border-b border-white/5 pb-4">
            <div className={sectionHeading}>Roll</div>
            <p className="text-sm text-white/80">{model.rollSummary}</p>
            {model.rollDetail ? <p className="text-xs text-white/50">{model.rollDetail}</p> : null}
          </div>
        ) : null}
        <div className="space-y-2 border-b border-white/5 pb-4">
          <div className={sectionHeading}>Outcome</div>
          <p className="text-sm text-amber-200">{model?.outcomeLabel ?? "Outcome pending"}</p>
          {showTierLabel ? <p className="text-xs text-white/60">{model.outcomeTierLabel}</p> : null}
          {model?.intentLabel ? (
            <p className="text-xs text-white/60">Action: {model.intentLabel}</p>
          ) : null}
          {model?.notesLabel ? <p className="text-xs text-white/60">Notes: {model.notesLabel}</p> : null}
        </div>
      </div>

      <div className="mt-6 border-t border-white/5 pt-4">
        <div className={sectionHeading}>Consequences</div>
        <ul className="mt-3 space-y-2">
          {ledgerEntries.map((entry) => (
            <li key={entry.id} className="text-sm text-slate-200">
              <span className="font-semibold text-slate-100">
                {consequenceLabel[entry.category] ?? "World"} —
              </span>{" "}
              {entry.cause}
              {entry.effect ? ` → ${entry.effect}` : ""}
            </li>
          ))}
          {stateDeltas.map((delta) => (
            <li key={`${delta.key}-${delta.value}`} className="text-sm text-slate-200">
              <span className="font-semibold text-slate-100">{delta.key}:</span> {delta.value}
            </li>
          ))}
          {!hasConsequences && (
            <li className={emptyState}>No consequences were recorded for this turn.</li>
          )}
        </ul>
      </div>
    </section>
  );
}
