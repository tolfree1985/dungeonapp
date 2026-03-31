"use client";

import { useState } from "react";

type SceneArtActionButtonProps = {
  action: "retry" | "force-regenerate" | "clear-and-regenerate";
  sceneKey: string;
  promptHash: string;
  sceneText: string;
  stylePreset?: string | null;
  renderMode?: "full" | "preview";
  label: string;
};

export default function SceneArtActionButton({
  sceneKey,
  sceneText,
  stylePreset = null,
  renderMode = "full",
  action,
  label,
}: SceneArtActionButtonProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAction = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/scene-art/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          sceneKey,
          promptHash,
          sceneText,
          stylePreset,
          renderMode,
        }),
      });
      if (!response.ok) throw new Error(`Scene art ${action} failed`);
      window.location.reload();
    } catch (error) {
      console.error(error);
      setIsSubmitting(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleAction}
      disabled={isSubmitting}
      className="mt-2 inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-amber-200 transition hover:border-amber-300/80 disabled:opacity-60"
    >
      {isSubmitting ? `${label}…` : label}
    </button>
  );
}
