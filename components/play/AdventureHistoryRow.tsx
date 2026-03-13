"use client";

import type { AdventureHistoryRowViewModel } from "@/components/play/presenters";

type Props = {
  model: AdventureHistoryRowViewModel;
};

const modeTone: Record<"DO" | "SAY" | "LOOK", string> = {
  DO: "text-amber-300 border border-amber-500/40 bg-amber-500/10",
  SAY: "text-violet-200 border border-violet-500/40 bg-violet-500/10",
  LOOK: "text-sky-200 border border-sky-500/40 bg-sky-500/10",
};

const tierBadgeClass = (label?: string | null) => {
  const tier = (label ?? "").toLowerCase();
  if (tier.includes("success with cost")) {
    return "bg-amber-500/20 text-amber-300 border border-amber-500/30";
  }
  if (tier.includes("success")) {
    return "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30";
  }
  if (tier.includes("fail forward")) {
    return "bg-orange-500/20 text-orange-300 border border-orange-500/30";
  }
  if (tier.includes("fail")) {
    return "bg-rose-500/20 text-rose-300 border border-rose-500/30";
  }
  return "bg-neutral-700 text-neutral-200 border border-white/10";
};

export default function AdventureHistoryRow({ model }: Props) {
  const modeClass = modeTone[model.mode ?? "DO"] ?? modeTone.DO;
  const isSessionStart = model.turnIndex === 0;
  const headlineLabel = isSessionStart ? "Session start" : `Turn ${model.turnIndex}`;
  const outcomeText = model.outcome ?? (isSessionStart ? "Initial state recorded" : "Outcome pending");
  const outcomeBadgeLabel = (model.tierLabel ?? outcomeText).toUpperCase();

  return (
    <div className="border-b border-white/5 py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.35em] text-white/60">
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.3em] ${modeClass}`}>
          {model.mode ?? "—"}
        </span>
        <span>{headlineLabel}</span>
        <span className={`ml-auto rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.3em] ${tierBadgeClass(model.tierLabel ?? model.outcome)}`}>
          {outcomeBadgeLabel}
        </span>
      </div>
      <p className="mt-1 text-sm font-semibold text-white leading-snug">{model.command}</p>
      {model.consequenceSummary.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-white/70">
          {model.consequenceSummary.map((line, index) => (
            <li key={`${model.turnIndex}-${index}`} className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
