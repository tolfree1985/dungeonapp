"use client";

import { ui } from "@/lib/ui/classes";
import type { AdventureHistoryRowViewModel } from "@/components/play/presenters";

type Props = {
  model: AdventureHistoryRowViewModel;
};

export default function AdventureHistoryRow({ model }: Props) {
  const modeLabel = model.mode ? model.mode : "—";
  const consequences = model.consequenceSummary;
  return (
    <article className={`${ui.panel} rounded-[18px] border border-white/10 bg-black/10 p-4`}>
      <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.3em] text-slate-500">
        <span>Turn {model.turnIndex}</span>
        {model.pressure ? (
          <span className="text-amber-200">Pressure: {model.pressure}</span>
        ) : (
          <span className="text-slate-400">Pressure unknown</span>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-[0.35em] text-slate-500">
        <span className={`rounded-full border border-white/10 px-3 py-1 ${modeLabel === "LOOK" ? "text-[#d3e1ff]" : modeLabel === "SAY" ? "text-[#f0dfea]" : "text-amber-200"}`}>
          {modeLabel}
        </span>
        <span className="text-[10px] text-[#a59e90]">{model.timestampLabel}</span>
      </div>
      <div className="mt-4 space-y-3 text-sm text-white">
        <div>
          <div className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Command</div>
          <p className="font-semibold">{model.command}</p>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Outcome</div>
          <p className="text-amber-200">{model.outcome || "Outcome pending"}</p>
        </div>
      </div>
      {consequences.length > 0 && (
        <div className="mt-4 space-y-1">
          <div className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Consequences</div>
          <ul className="space-y-1 text-sm text-slate-200">
            {consequences.map((line, index) => (
              <li key={`consequence-${index}`} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}
