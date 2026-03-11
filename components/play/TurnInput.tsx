"use client";

import { FormEvent, useMemo, useState } from "react";
import { ui } from "@/lib/ui/classes";

type TurnMode = "do" | "say" | "see";

const modeConfig: Record<TurnMode, { label: string; placeholder: string }> = {
  do: { label: "Do", placeholder: "What do you do?" },
  say: { label: "Say", placeholder: "What do you say?" },
  see: { label: "Look", placeholder: "What do you examine?" },
};

const accentMap: Record<TurnMode, string> = {
  do: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  say: "border-[#b0869f]/40 bg-[#b0869f]/10 text-[#f0dfea]",
  see: "border-[#7d91b8]/40 bg-[#7d91b8]/10 text-[#d3e1ff]",
};

const helperCopyMap: Record<TurnMode, string> = {
  do: "Attempt a physical action.",
  say: "Speak to influence the scene.",
  see: "Examine details or gather information.",
};

type TurnInputProps = {
  adventureId: string;
};

export default function TurnInput({ adventureId }: TurnInputProps) {
  const [mode, setMode] = useState<TurnMode>("do");
  const [playerText, setPlayerText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = Boolean(playerText.trim()) && !isSubmitting;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    setError(null);

    const trimmed = playerText.trim();
    const prefix = mode === "do" ? "" : `${modeConfig[mode].label}: `;
    const composedText = `${prefix}${trimmed}`;

    try {
      const response = await fetch("/api/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adventureId, playerText: composedText }),
      });

      if (!response.ok) {
        throw new Error("Failed to take turn.");
      }

      setPlayerText("");
      window.location.reload();
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const modeButtons = useMemo(
    () =>
      (Object.keys(modeConfig) as TurnMode[]).map((key) => {
        const active = mode === key;
        const activeClass = `${accentMap[key]} border border-white/10 shadow-[0_0_15px_rgba(0,0,0,0.45)]`;
        const inactiveClass = "border border-white/10 bg-black/10 text-[#a59e90] hover:text-[#f3efe6] hover:bg-white/5";
        return (
          <button
            key={key}
            type="button"
            onClick={() => setMode(key)}
            disabled={isSubmitting}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition duration-150 ${
              active ? activeClass : inactiveClass
            } ${isSubmitting ? "opacity-60" : ""}`}
          >
            {modeConfig[key].label}
          </button>
        );
      }),
    [isSubmitting, mode]
  );

  return (
    <form
      onSubmit={handleSubmit}
      className={`${ui.panel} p-5 space-y-4 transition focus-within:bg-black/25 focus-within:border-amber-400/30`}
    >
      <div>
        <div className={`${ui.sectionLabel}`}>Command</div>
        <p className="mt-1 text-xs text-[#a59e90]">Switch between Do, Say, and Look to frame your intent.</p>
        <p className="text-xs text-[#c9a35a]">{helperCopyMap[mode]}</p>
      </div>

      <div className="inline-flex rounded-full border border-white/10 bg-black/20 p-1">
        {modeButtons}
      </div>

      <textarea
        name="playerText"
        value={playerText}
        onChange={(event) => setPlayerText(event.target.value)}
        placeholder={modeConfig[mode].placeholder}
        disabled={isSubmitting}
        className="mt-2 min-h-[120px] w-full rounded-[18px] border border-white/10 bg-black/20 px-4 py-3 text-[15px] text-[#f3efe6] placeholder:text-[#7e786d] focus:border-amber-300/30 focus:outline-none focus:ring-2 focus:ring-amber-300/15 disabled:cursor-not-allowed disabled:opacity-60"
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-[#a59e90]">Describe your action clearly. Chronicle AI remembers every word.</p>
        <button
          type="submit"
          disabled={!canSubmit}
          className={`inline-flex items-center justify-center rounded-full border border-amber-300/20 px-5 py-2.5 text-sm font-medium transition duration-150 ${
            isSubmitting
              ? "bg-amber-400/20 text-amber-200 cursor-wait pointer-events-none shadow-[0_0_25px_rgba(201,163,90,0.4)]"
              : canSubmit
              ? "bg-amber-400/10 text-amber-200 hover:bg-amber-400/15"
              : "bg-amber-400/5 text-amber-100/80 cursor-not-allowed"
          }`}
        >
          {isSubmitting ? "Resolving..." : "Take Turn"}
        </button>
      </div>

      {error ? <p className="text-xs text-rose-300">{error}</p> : null}
    </form>
  );
}
