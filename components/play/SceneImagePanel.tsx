"use client";
import type { ResolvedSceneImage, SceneArtLifecycleStatus } from "@/lib/sceneArt";
import type { SceneContinuityState } from "@/lib/sceneContinuity";
import type { SceneFocusState } from "@/lib/resolveSceneFocusState";
import type { SceneTransition } from "@/lib/resolveSceneTransition";
import SceneArtActionButton from "@/components/play/SceneArtActionButton";

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
  retrySceneKey,
  retrySceneText,
  retryStylePreset,
  retryRenderMode = "full",
}: {
  sceneArt: (ResolvedSceneImage & { resolvedBackdropUrl?: string | null }) | null;
  caption?: string | null;
  transition?: SceneTransition | null;
  continuity?: SceneContinuityState | null;
  focusState?: SceneFocusState | null;
  transitionCue?: string | null;
  retrySceneKey?: string | null;
  retrySceneText?: string | null;
  retryStylePreset?: string | null;
  retryRenderMode?: "full" | "preview";
}) {
  const resolvedImageUrl =
    sceneArt?.imageUrl ??
    sceneArt?.resolvedBackdropUrl ??
    null;
  const isUnavailable =
    sceneArt?.status === "failed" &&
    sceneArt?.lastProviderRetryable === false;
  const hasReadyImage = !!sceneArt?.imageUrl && sceneArt?.status === "ready";
  const canRenderSceneImage = hasReadyImage && !!resolvedImageUrl;
  const isInFlight =
    sceneArt?.status === "queued" ||
    sceneArt?.status === "generating" ||
    sceneArt?.status === "retryable";
  const focusLabel = focusState?.focusLabel ? `Focus: ${focusState.focusLabel}` : undefined;
  const renderStateBadge = hasReadyImage
    ? "Scene art ready"
    : isUnavailable
    ? "Scene art unavailable"
    : sceneArt?.status === "queued"
    ? "Scene art queued"
    : sceneArt?.status === "generating"
    ? "Generating scene art"
    : "Default scene";
  const showRetryButton =
    (isUnavailable || renderStateBadge === "Scene art missing") &&
    !!retrySceneKey &&
    !!retrySceneText;
  const showForce =
    (hasReadyImage || isUnavailable || renderStateBadge === "Scene art missing") &&
    !!retrySceneKey &&
    !!retrySceneText;
  const showActionButtons = (showRetryButton || showForce) && !!retrySceneKey && !!retrySceneText;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-stone-800 bg-stone-950/80">
      <div className="relative aspect-[16/9] w-full bg-stone-900">
        {canRenderSceneImage ? (
            <img
              src={resolvedImageUrl!}
            alt={sceneArt?.sceneKey ?? "Scene art"}
            className="h-full w-full object-cover"
            onError={(event) => {
              const src = (event.currentTarget as HTMLImageElement).src;
              if (sceneArt?.status === "queued") {
                console.warn("scene.art.image_not_ready_yet", {
                  sceneKey: sceneArt?.sceneKey ?? null,
                  promptHash: sceneArt?.promptHash ?? null,
                  src,
                });
                return;
              }
              console.error("scene.art.image_load_failed", {
                sceneKey: sceneArt?.sceneKey ?? null,
                promptHash: sceneArt?.promptHash ?? null,
                src,
                status: sceneArt?.status ?? null,
              });
            }}
          />
        ) : (
          <DefaultBackdrop />
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
          {renderStateBadge ? (
            <span className="rounded-md border border-amber-500/40 bg-amber-950/70 px-2 py-1 text-amber-200">
              {renderStateBadge}
            </span>
          ) : null}
        </div>
        <div className="absolute top-4 left-2 text-[10px] uppercase tracking-[0.3em]">
            <span
              className={`rounded-md border px-2 py-1 ${hasReadyImage ? "border-emerald-500/40 bg-emerald-950/70 text-emerald-200" : "border-white/15 bg-black/50 text-neutral-400"}`}
            >
              {canRenderSceneImage ? "GENERATED SCENE" : isUnavailable ? "SCENE ART UNAVAILABLE" : "DEFAULT BACKDROP"}
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
        {showActionButtons ? (
          <div className="absolute bottom-3 right-3 flex flex-col gap-2">
            {showRetryButton && (
            <SceneArtActionButton
              sceneKey={retrySceneKey!}
              promptHash={sceneArt?.promptHash ?? ""}
              sceneText={retrySceneText!}
              stylePreset={retryStylePreset}
              renderMode={retryRenderMode}
              action="retry"
              label="Retry render"
            />
            )}
            {showForce && (
            <SceneArtActionButton
              sceneKey={retrySceneKey!}
              promptHash={sceneArt?.promptHash ?? ""}
              sceneText={retrySceneText!}
              stylePreset={retryStylePreset}
              renderMode={retryRenderMode}
              action="force-regenerate"
              label="Force regenerate"
              />
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DefaultBackdrop() {
  return (
    <div className="h-full w-full bg-[radial-gradient(circle_at_top,_rgba(120,120,120,0.14),_transparent_55%),linear-gradient(180deg,rgba(20,18,16,0.92),rgba(10,10,12,0.98))]" />
  );
}
