"use client";

import { FormEvent, useState } from "react";

type TurnInputProps = {
  adventureId: string;
};

type TurnMode = "do" | "say" | "look";

const placeholders: Record<TurnMode, string> = {
  do: "What do you do?",
  say: "What do you say?",
  look: "What do you examine?",
};

export default function TurnInput({ adventureId }: TurnInputProps) {
  const [mode, setMode] = useState<TurnMode>("do");
  const [playerText, setPlayerText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = playerText.trim().length > 0 && !isSubmitting;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    setError(null);

    const prefix = mode === "do" ? "Do" : mode === "say" ? "Say" : "Look";

    try {
      const response = await fetch("/api/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adventureId,
          playerText: `${prefix}: ${playerText.trim()}`,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to take turn.");
      }

      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to take turn.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-6 rounded-2xl border-2 border-amber-400 bg-stone-950 p-5 text-stone-100 shadow-lg"
    >
      <div className="mb-3 text-xs font-bold uppercase tracking-[0.25em] text-amber-300">Command</div>

      <div className="mb-4 flex gap-2">
        {(["do", "say", "look"] as TurnMode[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setMode(key)}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              mode === key
                ? "bg-amber-400 text-black"
                : "border border-stone-600 bg-stone-900 text-stone-200"
            }`}
          >
            {key === "do" ? "Do" : key === "say" ? "Say" : "Look"}
          </button>
        ))}
      </div>

      <textarea
        value={playerText}
        onChange={(e) => setPlayerText(e.target.value)}
        placeholder={placeholders[mode]}
        className="mb-4 min-h-[140px] w-full rounded-xl border border-stone-600 bg-stone-900 p-4 text-base text-stone-100 placeholder:text-stone-500"
      />

      <div className="flex items-center justify-between gap-4">
        <div className="text-sm text-stone-400">Adventure: {adventureId}</div>
        <button
          type="submit"
          disabled={!canSubmit}
          className={`rounded-xl px-5 py-3 font-semibold ${
            canSubmit ? "bg-amber-400 text-black" : "bg-stone-700 text-stone-400"
          }`}
        >
          {isSubmitting ? "Resolving..." : "Take Turn"}
        </button>
      </div>

      {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
    </form>
  );
}
