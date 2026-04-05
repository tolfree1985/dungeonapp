"use client";

import { sectionHeading, cardShell, cardPadding } from "./cardStyles";
import type { LatestTurnViewModel } from "./presenters";
import { pressureBorderClass } from "@/lib/ui/pressure-style";

function Slot({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  if (!value) return null;

  return (
    <div className="space-y-1">
      <div className="text-[11px] uppercase tracking-[0.28em] text-zinc-500">{label}</div>
      <div className="text-sm text-zinc-300">{value}</div>
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

  const outcomeLabel = model.outcomeLabel ?? "Outcome pending";
  const commandLabel = model.playerInput ?? "Command missing";
  const sceneSummary =
    model.sceneSummary ?? model.sceneText ?? "The scene will resolve once your action completes.";
  const consequenceSlots = model.consequenceSlots;
  const hasConsequenceSlots = Boolean(
    consequenceSlots.gain ||
    consequenceSlots.shift ||
    consequenceSlots.cost ||
    consequenceSlots.hook
  );

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
      </div>
      <div className="mt-4 space-y-3">
        <div className="text-sm text-zinc-300">
          {model.mode ?? "Action"} — {commandLabel}
        </div>
        <div className="text-lg font-semibold text-white">{outcomeLabel}</div>
        <div className="text-sm text-zinc-300">{sceneSummary}</div>
        <div className="mt-5 space-y-4">
          <Slot label="You gained" value={consequenceSlots.gain} />
          <Slot label="The scene changed" value={consequenceSlots.shift} />
          <Slot label="It cost" value={consequenceSlots.cost} />
          <Slot label="Next move" value={consequenceSlots.hook} />
          {!hasConsequenceSlots ? (
            <div className="text-sm text-zinc-500">No immediate consequences detected.</div>
          ) : null}
        </div>
        {model.followUpHook ? (
          <p className="mt-2 text-xs italic text-amber-200/80">{model.followUpHook}</p>
        ) : null}
        {model.pressureNote ? (
          <p className="mt-2 text-xs text-amber-200/70">{model.pressureNote}</p>
        ) : null}
      </div>
    </section>
  );
}
