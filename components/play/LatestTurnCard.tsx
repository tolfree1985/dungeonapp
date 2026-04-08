"use client";

import { sectionHeading, cardShell, cardPadding } from "./cardStyles";
import type { LatestTurnViewModel } from "./presenters";
import { pressureBorderClass } from "@/lib/ui/pressure-style";

function ConsequenceList({
  label,
  items,
}: {
  label: string;
  items: string[];
}) {
  if (!items.length) return null;

  return (
    <div className="space-y-1">
      <div className="text-[11px] uppercase tracking-[0.28em] text-zinc-500">{label}</div>
      <ul className="mt-1 space-y-1 text-sm text-zinc-300">
        {items.map((item) => (
          <li key={item} className="flex gap-2 leading-relaxed">
            <span className="text-amber-400">•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type Props = {
  model: LatestTurnViewModel | null;
  isHighlighted?: boolean;
};

export default function LatestTurnCard({ model, isHighlighted }: Props) {
  const highlightClass = isHighlighted
    ? "ring-1 ring-amber-400/60 shadow-[0_0_35px_rgba(250,204,61,0.45)]"
    : "";
  if (!model || !model.turnIndex) {
    return (
      <section className={`${cardShell} ${cardPadding} ${highlightClass}`}>
        <div className={sectionHeading}>Latest Turn</div>
        <p className="text-lg font-semibold text-white">Awaiting your first resolved turn.</p>
        <p className="text-sm text-white/60">Submit an action and the outcome will appear here.</p>
      </section>
    );
  }

  const commandLabel = model.playerInput ?? "Command missing";
  const fallbackSceneSummary =
    model.sceneSummary ?? model.sceneText ?? "The scene will resolve once your action completes.";
  const narrativeText = model.storyBeat ?? fallbackSceneSummary;
  const rawOutcomeSummary =
    (model.outcomeTierLabel && model.outcomeTierLabel.trim()) ||
    (model.outcomeLabel && model.outcomeLabel.trim()) ||
    "Outcome pending";
  function formatOutcome(summary: string, isFailForward: boolean) {
    const normalized = summary.toLowerCase();
    if (isFailForward) {
      if (normalized.includes("setback") || normalized.includes("fail-forward")) return "Setback";
      return "Partial Success";
    }
    if (normalized.includes("success with cost") || normalized.includes("success at a cost")) return "Success at a Cost";
    if (normalized.includes("partial")) return "Partial Success";
    if (normalized.includes("success")) return "Success";
    if (normalized.includes("setback")) return "Setback";
    if (normalized.includes("failure") || normalized.includes("hard failure")) return "Failure";
    return summary;
  }
  const outcomeSummary = formatOutcome(rawOutcomeSummary, !!model.failForwardComplication);


  return (
    <section className={`${cardShell} ${cardPadding} ${pressureBorderClass(model.pressureStage)} ${highlightClass}`}>
      <div className="space-y-2">
        <div className={sectionHeading}>Latest Turn</div>
        <div className="flex items-center gap-3">
          <p className="text-3xl font-semibold text-white">Turn {model.turnIndex}</p>
          {model.mode ? (
            <span className="rounded-full border border-white/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.35em] text-white/70">
              {model.mode}
            </span>
          ) : null}
        </div>
        <div className="mt-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm">
          <div className="text-[10px] uppercase tracking-[0.3em] text-white/50">Outcome</div>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-base font-semibold text-white">{outcomeSummary}</span>
          </div>
        </div>
        {(model.turnChangeAchievements.length > 0 || model.turnChangeCosts.length > 0) && (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.3em] text-white/50">You still achieved</div>
              {model.turnChangeAchievements.length > 0 ? (
                <ul className="mt-2 space-y-1 text-sm text-zinc-100">
                  {model.turnChangeAchievements.map((label, index) => (
                    <li key={`${label}-${index}`} className="flex items-center gap-2">
                      <span className="text-xs text-amber-300">+</span>
                      <span>{label}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-zinc-400">No achieved signals surfaced.</p>
              )}
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.3em] text-white/50">Cost</div>
              {model.turnChangeCosts.length > 0 ? (
                <ul className="mt-2 space-y-1 text-sm text-zinc-100">
                  {model.turnChangeCosts.map((label, index) => (
                    <li key={`${label}-${index}`} className="flex items-center gap-2">
                      <span className="text-xs text-amber-300">-</span>
                      <span>{label}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-zinc-400">No additional costs registered.</p>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="mt-4 space-y-3">
        <div className="text-sm text-zinc-300">
          {model.mode ?? "Action"} — {commandLabel}
        </div>
        <div className="mt-6 space-y-2">
          <div className="text-[11px] uppercase tracking-[0.32em] text-zinc-500">Story</div>
          <p className="max-w-[68ch] text-[17px] leading-8 text-zinc-100">{narrativeText}</p>
        </div>
        <div className="mt-4 rounded-xl border border-white/10 bg-black/10 px-3 py-2 text-sm">
          <div className="text-[10px] uppercase tracking-[0.3em] text-white/50">Turn changes</div>
          {model.turnChanges.length > 0 ? (
            <ul className="mt-2 space-y-1 text-sm text-zinc-100">
              {model.turnChanges.map((change, index) => (
                <li key={`${change.label}-${index}`} className="flex items-center gap-2">
                  <span className="text-xs text-amber-300">•</span>
                  <span>{change.label}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-zinc-400">No measurable changes occurred this turn.</p>
          )}
        </div>
        <div className="mt-4 rounded-xl border border-white/10 bg-black/30 px-4 py-3 space-y-2 text-sm text-white">
          <div className="text-[10px] uppercase tracking-[0.3em] text-white/50">Persistent</div>
          {model.persistentWorldConsequences.length > 0 ? (
            <ul className="space-y-1 text-sm text-white/70">
              {model.persistentWorldConsequences.map((line) => (
                <li key={line} className="flex items-center gap-2">
                  <span className="text-xs text-white/60">•</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-zinc-400">No persistent consequences surfaced.</p>
          )}
        </div>
        {model.followUpHook ? (
          <p className="mt-2 text-xs italic text-amber-200/80">{model.followUpHook}</p>
        ) : null}
        {model.pressureNote ? (
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs uppercase tracking-[0.3em] text-amber-200">
            <p className="font-semibold">PRESSURE</p>
            <p className="mt-1 text-[11px] text-amber-100/80">{model.pressureNote}</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
