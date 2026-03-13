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

const outcomeTone = (label?: string | null) => {
  const normalized = (label ?? "").toLowerCase();
  if (normalized.includes("fail")) return "text-rose-300";
  if (normalized.includes("cost") || normalized.includes("mixed")) return "text-amber-300";
  if (normalized.includes("success")) return "text-emerald-300";
  return "text-white/70";
};

export default function AdventureHistoryRow({ model }: Props) {
  const modeClass = modeTone[model.mode ?? "DO"] ?? modeTone.DO;
  const outcomeClass = outcomeTone(model.outcome);
  const isSessionStart = model.turnIndex === 0;
  const headlineLabel = isSessionStart ? "Session start" : `Turn ${model.turnIndex}`;
  const outcomeText = model.outcome ?? (isSessionStart ? "Initial state recorded" : "Outcome pending");

  return (
    <div className="border-b border-white/5 py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.35em] text-white/60">
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.3em] ${modeClass}`}>
          {model.mode ?? "—"}
        </span>
        <span>{headlineLabel}</span>
        <span className={`ml-auto ${outcomeClass}`}>{outcomeText}</span>
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
