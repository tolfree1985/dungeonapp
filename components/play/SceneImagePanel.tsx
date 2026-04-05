"use client";
import type { ResolvedSceneImage } from "@/lib/sceneArt";
import type { SceneContinuityState } from "@/lib/sceneContinuity";
import type { SceneFocusState } from "@/lib/resolveSceneFocusState";
import type { SceneTransition } from "@/lib/resolveSceneTransition";

const transitionBadgeTone: Record<SceneTransition["type"], string> = {
  hold: "border-emerald-500/40 bg-emerald-950/50 text-emerald-200",
  advance: "border-amber-500/40 bg-amber-950/50 text-amber-200",
  cut: "border-rose-500/40 bg-rose-950/50 text-rose-200",
};

export function SceneImagePanel({
  sceneArt,
  caption,
  transition,
  continuity,
  focusState,
  transitionCue,
  isRenderingScene,
}: {
  sceneArt: (ResolvedSceneImage & { resolvedBackdropUrl?: string | null }) | null;
  caption?: string | null;
  transition?: SceneTransition | null;
  continuity?: SceneContinuityState | null;
  focusState?: SceneFocusState | null;
  transitionCue?: string | null;
  isRenderingScene?: boolean;
}) {
  const resolvedImageUrl = sceneArt?.imageUrl ?? sceneArt?.resolvedBackdropUrl ?? null;
  const status = sceneArt?.status;
  const isActivated = status === "queued" || status === "generating" || status === "ready";
  const hasReadyImage = Boolean(resolvedImageUrl && status === "ready");
  const focusLabel = focusState?.focusLabel ? `Focus: ${focusState.focusLabel}` : undefined;
  const renderStateBadge = hasReadyImage
    ? "Scene art ready"
    : isRenderingScene
    ? "Rendering scene art"
    : "Scene art queued";

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border bg-black/40 transition duration-500 ${
        isActivated
          ? hasReadyImage
            ? "border-emerald-400/40 shadow-[0_0_36px_rgba(16,185,129,0.22)]"
            : "border-emerald-400/25 shadow-[0_0_24px_rgba(16,185,129,0.12)]"
          : "border-white/10"
      }`}
    >
      <div className="relative aspect-[16/9] w-full bg-stone-900">
        {hasReadyImage && resolvedImageUrl ? (
          <img
            src={resolvedImageUrl}
            alt={sceneArt?.sceneKey ?? "Scene art"}
            className="h-full w-full object-cover"
            onError={(event) => {
              const src = (event.currentTarget as HTMLImageElement).src;
              console.error("scene.art.image_load_failed", {
                sceneKey: sceneArt?.sceneKey ?? null,
                promptHash: sceneArt?.promptHash ?? null,
                src,
                status: sceneArt?.status ?? null,
              });
            }}
          />
        ) : (
          <RenderingFallback isRenderingScene={isRenderingScene} />
        )}
        <div className="absolute -top-4 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1 text-[10px] uppercase tracking-[0.3em]">
          <span className="text-white/60">Scene transition</span>
          {transition && (
            <span className={`rounded-full border px-2 py-0.5 ${transitionBadgeTone[transition.type]}`}>
              {transition.type.toUpperCase()}
            </span>
          )}
        </div>
        <div className="absolute -top-2 left-2 flex gap-2 text-[10px] uppercase tracking-[0.3em]">
          <span className="rounded-md border border-amber-500/40 bg-amber-950/70 px-2 py-1 text-amber-200">
            {renderStateBadge}
          </span>
        </div>
        <div className="absolute top-4 left-2 text-[10px] uppercase tracking-[0.3em]">
          <span
            className={`rounded-md border px-2 py-1 ${
              hasReadyImage
                ? "border-emerald-500/40 bg-emerald-950/70 text-emerald-200"
                : "border-white/15 bg-black/50 text-neutral-400"
            }`}
          >
            {hasReadyImage ? "GENERATED SCENE" : "SCENE VIEWPORT"}
          </span>
        </div>
        {transition && (
          <div className="absolute -top-2 right-2 flex gap-2 text-[10px] uppercase tracking-[0.3em]">
            <span className={`rounded-md border px-2 py-1 ${transitionBadgeTone[transition.type]}`}>{transition.type}</span>
          </div>
        )}
        {focusLabel ? (
          <div className="absolute bottom-7 left-3 rounded-md border border-white/10 bg-black/70 px-3 py-1 text-xs text-white/80 backdrop-blur-sm">
            {focusLabel}
          </div>
        ) : null}
        {transitionCue ? (
          <div className="absolute bottom-7 right-3 rounded-md border border-white/10 bg-black/70 px-3 py-1 text-xs uppercase tracking-[0.25em] text-white/80 backdrop-blur-sm">
            {transitionCue}
          </div>
        ) : null}
        {caption ? (
          <div className="absolute bottom-3 left-3 rounded-md border border-white/10 bg-black/60 px-3 py-1 text-xs uppercase tracking-[0.3em] text-white/80 backdrop-blur-sm">
            {caption}
          </div>
        ) : null}
        {continuity?.shouldRequestRefresh ? (
          <div className="absolute bottom-3 right-3 rounded-md border border-amber-500/40 bg-amber-950/70 px-2 py-1 text-[10px] uppercase tracking-[0.3em] text-amber-200">
            refresh ready
          </div>
        ) : null}
      </div>
    </div>
  );
}

function RenderingFallback({
  isRenderingScene,
}: {
  isRenderingScene?: boolean;
}) {
  return (
    <div className="relative flex h-full min-h-[360px] w-full items-center justify-center overflow-hidden rounded-2xl border border-amber-500/25 bg-gradient-to-b from-stone-950 via-stone-950 to-black shadow-[0_0_30px_rgba(245,158,11,0.06)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(245,158,11,0.08),transparent_60%)]" />
      <div className="relative z-10 flex flex-col items-center px-6 text-center">
        <div className="mb-5 h-14 w-14 rounded-full border border-amber-400/20 bg-amber-300/5 animate-pulse" />
        <p className="text-sm font-medium text-stone-100">
          {isRenderingScene ? "Rendering the scene…" : "Preparing the tableau…"}
        </p>
        <p className="mt-2 text-xs text-stone-500">The visual layer is awakening.</p>
      </div>
    </div>
  );
}
