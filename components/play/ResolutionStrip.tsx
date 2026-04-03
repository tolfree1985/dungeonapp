"use client";

import type { TurnResolutionPresentation } from "@/server/scene/turn-resolution-presentation";
import type { PressureStage } from "@/app/play/types";
import { pressureTextClass } from "@/lib/ui/pressure-style";

type Props = {
  resolution: TurnResolutionPresentation | null;
  pressureStage?: PressureStage;
};

function formatOutcomeLabel(resolution: TurnResolutionPresentation | null) {
  if (!resolution) return "unknown";
  if (resolution.resultLabel) {
    return resolution.resultLabel;
  }
  return resolution.outcome.toLowerCase().replaceAll("_", " ");
}

function outcomeClass(stage: PressureStage) {
  return pressureTextClass(stage);
}

export function ResolutionStrip({ resolution, pressureStage }: Props) {
  if (!resolution) return null;
  const stage = pressureStage ?? "calm";
  return (
    <div className="space-y-1 border-b border-white/5 pb-4">
      <div className="rounded-[14px] border border-amber-500/20 bg-amber-500/5 px-3 py-2 shadow-[0_0_25px_rgba(250,204,61,0.15)]">
        <div className="text-xl font-semibold uppercase tracking-[0.3em]" data-testid="resolution-outcome-label">
          <span className={outcomeClass(stage)}>{formatOutcomeLabel(resolution)}</span>
        </div>
      </div>
    </div>
  );
}
