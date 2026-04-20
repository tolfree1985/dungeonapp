"use client";

import { useState } from "react";

type ScenarioStartButtonProps = {
  scenarioId: string;
};

export default function ScenarioStartButton({ scenarioId }: ScenarioStartButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleStart = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const response = await fetch("/api/adventures/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenarioId }),
      });
      if (!response.ok) {
        throw new Error("Failed to create adventure");
      }
      const data = (await response.json()) as { adventureId?: string };
      if (!data.adventureId) {
        throw new Error("Adventure id missing");
      }
      window.location.href = `/play?adventureId=${encodeURIComponent(data.adventureId)}`;
    } catch (error) {
      console.error(error);
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleStart}
      disabled={loading}
      className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-amber-200 transition hover:border-amber-300/80 disabled:opacity-60"
    >
      {loading ? "Starting…" : "Start New Run"}
    </button>
  );
}
