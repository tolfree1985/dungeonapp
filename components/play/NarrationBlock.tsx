"use client";

import type { FinalizedConsequenceNarration } from "@/server/scene/finalized-consequence-narration";

type Props = {
  narration: FinalizedConsequenceNarration | null;
};

export function NarrationBlock({ narration }: Props) {
  if (!narration) return null;
  const lines = [
    ...narration.primaryLines,
    ...narration.complicationLines,
    ...narration.costLines,
  ];
  return (
    <div className="mt-2 space-y-1">
      {narration.headline ? (
        <div className="text-sm font-semibold text-white">{narration.headline}</div>
      ) : null}
      {lines.map((line, index) => (
        <p key={`narration-${index}`} className="text-[11px] leading-snug text-white/80">
          {line}
        </p>
      ))}
    </div>
  );
}
