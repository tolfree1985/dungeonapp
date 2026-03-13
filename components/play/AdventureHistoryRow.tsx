"use client";

import type { AdventureHistoryRowViewModel } from "@/components/play/presenters";
import { cardPadding, cardShell, emptyState, sectionHeading } from "./cardStyles";

type Props = {
  model: AdventureHistoryRowViewModel;
};

export default function AdventureHistoryRow({ model }: Props) {
  const modeLabel = model.mode ? model.mode : "—";
  const consequences = model.consequenceSummary;

  return (
    <article className={`${cardShell} bg-black/20 border-white/10 ${cardPadding} space-y-3`}>
      <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.35em] text-white/60">
        <span>Turn {model.turnIndex}</span>
        <span className="text-white/70">{model.timestampLabel}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.35em]">
        <span
          className={`rounded-full border border-white/10 px-3 py-1 text-white/70 ${
            modeLabel === "LOOK" ? "text-[#d3e1ff]" : modeLabel === "SAY" ? "text-[#f0dfea]" : "text-amber-200"
          }`}
        >
          {modeLabel}
        </span>
        <span className="ml-auto text-xs text-amber-200">Pressure: {model.pressure}</span>
      </div>
      <div className="space-y-4 text-sm text-white">
        <div>
          <div className={sectionHeading}>Command</div>
          <p className="text-lg font-semibold">{model.command}</p>
        </div>
        <div>
          <div className={sectionHeading}>Outcome</div>
          <p className="text-amber-200">{model.outcome || "Outcome pending"}</p>
        </div>
      </div>
      <div className="space-y-2">
        <div className={sectionHeading}>Consequences</div>
        {consequences.length > 0 ? (
          <ul className="space-y-1 text-sm text-slate-200">
            {consequences.map((line, index) => (
              <li key={`consequence-${index}`} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className={emptyState}>No consequences recorded.</div>
        )}
      </div>
    </article>
  );
}
