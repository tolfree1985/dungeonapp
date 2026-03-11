"use client";

import PressureMeter from "./PressureMeter";
import { ui } from "@/lib/ui/classes";
import type { LatestTurnDisplay } from "./presenters";

type Props = {
  model: LatestTurnDisplay;
};

export default function LatestTurnCard({ model }: Props) {
  return (
    <section className={`${ui.panel} space-y-6 p-6 md:p-8 animate-[chronicleTurnReveal_220ms_ease]`}>
      <div className="rounded-xl border border-red-500 bg-red-500/20 p-3 text-sm font-bold text-red-100">
        LATEST TURN CARD v2 MARKER
      </div>
      <div className={ui.heroIllustration} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className={`${ui.chip} border-amber-300/40 bg-amber-400/10 text-amber-200`}>{model.turnLabel}</span>
          {model.actionLabel && <span className={`${ui.chip} border-white/10 bg-white/5 text-[#d8d2c3]`}>{model.actionLabel}</span>}
        </div>
        <div className={ui.smallMeta}>{model.timestampLabel}</div>
      </div>

      <div className="space-y-1">
        <h2 className={ui.heroTitle}>BEGIN YOUR CHRONICLE TEST 999</h2>
        <div className={ui.heroSubtitle}>{model.subtitle}</div>
      </div>

      <div className="space-y-4">
        {model.leadText ? <p className={`${ui.heroParagraph} ${ui.heroLead}`}>{model.leadText}</p> : null}
        {model.bodyText ? <p className={ui.heroParagraph}>{model.bodyText}</p> : null}
      </div>

      <div className={ui.heroSystemStrip}>
        <div className="flex flex-wrap items-center gap-4">
          {model.outcomeLabel && (
            <span className="rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-white">
              {model.outcomeLabel}
            </span>
          )}
          <span className="rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-white">
            {model.pressureLabel}
          </span>
        </div>
      </div>

      {model.consequenceChips.length > 0 && (
        <div className="space-y-2">
          <div className={ui.sectionLabel}>Consequences</div>
          <div className="mt-3 flex flex-wrap gap-3">
            {model.consequenceChips.map((line, index) => (
              <span
                key={`consequence-${index}`}
                className="inline-flex rounded-full border px-3 py-1 text-xs font-medium border-white/10 bg-white/5 text-slate-200 animate-[chipPop_160ms_ease]"
                style={{ animationDelay: `${index * 40}ms` }}
              >
                {line}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4">
        <PressureMeter currentStage={model.pressureStage} />
      </div>
    </section>
  );
}
