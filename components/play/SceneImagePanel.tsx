import type { ResolvedSceneImage } from "@/lib/sceneArt";

export function SceneImagePanel({
  imageUrl,
  source,
  pending,
  caption,
}: ResolvedSceneImage & { caption?: string | null }) {
  const sourceLabel = () => {
    switch (source) {
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

  return (
    <div className="relative overflow-hidden rounded-2xl border border-stone-800 bg-stone-950/80">
      <div className="relative aspect-[16/9] w-full bg-stone-900">
        {imageUrl ? (
          <img src={imageUrl} alt={sourceLabel()} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs uppercase tracking-[0.35em] text-stone-500">
            No scene image available
          </div>
        )}
        <div className="absolute -top-2 left-2 flex gap-2 text-[10px] uppercase tracking-[0.3em]">
          <span className="rounded-md border border-white/15 bg-black/50 px-2 py-1 text-stone-200">
            {sourceLabel()}
          </span>
          {pending && (
            <span className="rounded-md border border-amber-500/40 bg-amber-950/70 px-2 py-1 text-amber-200">
              updating
            </span>
          )}
        </div>
        {caption ? (
          <div className="absolute bottom-3 left-3 rounded-md border border-white/10 bg-black/60 px-3 py-1 text-xs uppercase tracking-[0.3em] text-white/80 backdrop-blur-sm">
            {caption}
          </div>
        ) : null}
      </div>
    </div>
  );
}
