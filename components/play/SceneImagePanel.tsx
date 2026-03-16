import { useEffect, useState } from "react";
import type { ResolvedSceneImage } from "@/lib/sceneArt";
import type { SceneContinuityState } from "@/lib/sceneContinuity";
import type { SceneFocusState } from "@/lib/resolveSceneFocusState";
import type { SceneTransition } from "@/lib/resolveSceneTransition";

const transitionBadgeTone: Record<SceneTransition["type"], string> = {
  hold: "border-emerald-500/40 bg-emerald-950/50 text-emerald-200",
  advance: "border-amber-500/40 bg-amber-950/50 text-amber-200",
  cut: "border-rose-500/40 bg-rose-950/50 text-rose-200",
};

type DisplayedImage = {
  imageUrl: string | null;
  source: ResolvedSceneImage["source"];
};

function resolveDisplayedImage(
  current: DisplayedImage,
  next: DisplayedImage,
  transition: SceneTransition | null,
  continuity: SceneContinuityState | null
): DisplayedImage {
  if (!continuity) return next;

  if (continuity.shouldReuseImage) {
    if (transition?.type === "hold") {
      return current;
    }
    if (continuity.shouldRequestRefresh) {
      return current;
    }
    if (next.imageUrl && next.imageUrl !== current.imageUrl) {
      return next;
    }
    return current;
  }

  return next;
}

export function SceneImagePanel({
  imageUrl,
  source,
  pending,
  status,
  caption,
  transition,
  continuity,
  focusState,
  transitionCue,
}: ResolvedSceneImage & {
  caption?: string | null;
  transition?: SceneTransition | null;
  continuity?: SceneContinuityState | null;
  focusState?: SceneFocusState | null;
  transitionCue?: string | null;
}) {
  const [displayedImage, setDisplayedImage] = useState<DisplayedImage>({
    imageUrl: imageUrl ?? null,
    source: source ?? "default",
  });

  useEffect(() => {
    const nextImage: DisplayedImage = {
      imageUrl: imageUrl ?? null,
      source: source ?? "default",
    };

    setDisplayedImage((current) => resolveDisplayedImage(current, nextImage, transition ?? null, continuity ?? null));
  }, [imageUrl, source, transition, continuity]);

  const finalImageUrl = displayedImage.imageUrl;
  const finalSource = displayedImage.source;
  const focusLabel = focusState?.focusLabel ? `Focus: ${focusState.focusLabel}` : undefined;

  const sourceLabel = () => {
    switch (finalSource) {
      case "scene":
        return "Current Scene";
      case "previous":
        return "Previous Scene";
      case "location":
        return "Location Backdrop";
      default:
        return "Default Backdrop";
    }
  };
  const renderStateBadge =
    status === "failed"
      ? "Render failed"
      : pending
        ? "Rendering scene..."
        : finalSource === "scene"
          ? null
          : finalSource === "previous"
            ? "Using previous scene"
            : finalSource === "location"
              ? "Using location backdrop"
              : "Using fallback scene";
  const placeholderLabel =
    status === "failed"
      ? "Render failed"
      : pending
        ? "Rendering scene..."
        : finalSource === "default"
          ? "Default Chronicle Scene"
          : "No scene image available";

  return (
    <div className="relative overflow-hidden rounded-2xl border border-stone-800 bg-stone-950/80">
      <div className="relative aspect-[16/9] w-full bg-stone-900">
        {finalImageUrl ? (
          <img src={finalImageUrl} alt={sourceLabel()} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs uppercase tracking-[0.35em] text-stone-500">
            {placeholderLabel}
          </div>
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
          <span className="rounded-md border border-white/15 bg-black/50 px-2 py-1 text-stone-200">{sourceLabel()}</span>
          {renderStateBadge ? (
            <span className="rounded-md border border-amber-500/40 bg-amber-950/70 px-2 py-1 text-amber-200">
              {renderStateBadge}
            </span>
          ) : null}
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
