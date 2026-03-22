"use client";

import { useState } from "react";

type SceneArtRetryButtonProps = {
  sceneKey: string;
  sceneText: string;
  stylePreset?: string | null;
  renderMode?: "full" | "preview";
};

export default function SceneArtRetryButton({
  sceneKey,
  sceneText,
  stylePreset = null,
  renderMode = "full",
}: SceneArtRetryButtonProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleRetry = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/scene-art/recover/${encodeURIComponent(sceneKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retry", sceneText, stylePreset, renderMode }),
      });
      if (!response.ok) {
        throw new Error("Scene art retry failed");
      }
      window.location.reload();
    } catch (error) {
      console.error(error);
      setIsSubmitting(false);
    }
  };

  return (
    <button
      type="button"
      disabled={isSubmitting}
      onClick={handleRetry}
      className="mt-4 inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-amber-200 transition hover:border-amber-300/80 disabled:opacity-60"
    >
      {isSubmitting ? "Retrying…" : "Retry render"}
    </button>
  );
}
