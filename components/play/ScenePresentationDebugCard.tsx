"use client";

import type { SceneTransition } from "@/lib/resolveSceneTransition";
import type { ScenePresentation } from "@/lib/resolveTurnSceneArtPresentation";

type Props = {
  presentation: ScenePresentation | null;
  transition: SceneTransition | null;
  transitionCue: string | null;
};

export function ScenePresentationDebugCard({ presentation, transition, transitionCue }: Props) {
  if (!presentation && !transition && !transitionCue) {
    return null;
  }

  const tags = presentation?.promptFraming?.visualTags ?? [];
  const grammar = presentation?.shotGrammar;
  const motif = presentation?.motif;
  const threatFraming = presentation?.threatFraming;
  const threatFramingTags = presentation?.threatFramingTags ?? [];
  const revealStructure = presentation?.revealStructure;

  return (
    <section className="rounded-2xl border border-white/5 bg-white/5 p-4 text-[11px] text-white/70">
      <div className="text-[10px] font-semibold uppercase tracking-[0.35em] text-white/40">Scene presentation</div>
      {presentation ? (
        <div className="mt-2 space-y-1 text-xs">
          <div className="flex items-center justify-between text-[11px] text-white/60">
            <span>Shot intent</span>
            <span className="font-semibold text-white">{presentation.shotIntent}</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-white/60">
            <span>Shot grammar</span>
            <span className="whitespace-nowrap font-semibold text-white">
              {grammar ? `${grammar.emphasis} / ${grammar.compositionBias} / ${grammar.revealLevel}` : "—"}
            </span>
          </div>
          {motif ? (
            <div className="flex items-center justify-between text-[11px] text-white/60">
              <span>Motif</span>
              <span className="whitespace-nowrap font-semibold text-white">
                {motif.tone} · {motif.lighting} · {motif.atmosphere}
              </span>
            </div>
          ) : null}
          {threatFraming ? (
            <div className="flex items-center justify-between text-[11px] text-white/60">
              <span>Threat</span>
              <span className="whitespace-nowrap font-semibold text-white">
                {threatFraming.threatLevel} / {threatFraming.confrontationBias} / {threatFraming.subjectDominance}
              </span>
            </div>
          ) : null}
          {revealStructure ? (
            <div className="flex items-center justify-between text-[11px] text-white/60">
              <span>Reveal</span>
              <span className="whitespace-nowrap font-semibold text-white">
                {revealStructure.revealStage} · {revealStructure.revealFocus} · {revealStructure.revealClarity}
              </span>
            </div>
          ) : null}
          <div>
            <div className="text-[10px] uppercase tracking-[0.4em] text-white/40">Prompt tags</div>
            <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-white/70">
              {tags.map((tag, index) => (
                <span
                  key={`${tag}-${index}`}
                  className="rounded-full border border-white/10 px-2 py-1 text-[10px] font-semibold text-white"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
          {threatFramingTags.length > 0 ? (
            <div>
              <div className="text-[10px] uppercase tracking-[0.4em] text-white/40">Threat tags</div>
              <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-white/70">
                {threatFramingTags.map((tag, index) => (
                  <span
                    key={`threat-${tag}-${index}`}
                    className="rounded-full border border-white/10 px-2 py-1 text-[10px] font-semibold text-white"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      {transition ? (
        <div className="mt-3 rounded-2xl border border-white/10 bg-black/10 px-3 py-2 text-[11px] text-white/70">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.35em] text-white/40">
            <span>Transition</span>
            <span>{transition.type}</span>
          </div>
          <div className="mt-1 text-[10px] text-white/40">Cue: {transitionCue ?? "—"}</div>
        </div>
      ) : null}
    </section>
  );
}
