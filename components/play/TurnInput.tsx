"use client";

import { FormEvent, useMemo, useState } from "react";
import { cardPadding, cardShell, sectionHeading } from "./cardStyles";
import type { SceneTransition } from "@/lib/resolveSceneTransition";
import type { PressureStage } from "@/app/play/types";
import { getPressureClasses } from "@/lib/ui/pressure-style";

type TurnMode = "DO" | "SAY" | "LOOK";

const modeConfig: Record<TurnMode, { label: string; placeholder: string; description: string }> = {
  DO: {
    label: "Do",
    placeholder: "Move, manipulate, attempt, intervene...",
    description: "Attempt a physical action.",
  },
  SAY: {
    label: "Say",
    placeholder: "Speak, persuade, threaten, question...",
    description: "Speak to influence the scene.",
  },
  LOOK: {
    label: "Look",
    placeholder: "Inspect, study, listen, search...",
    description: "Examine details or gather information.",
  },
};

const accentMap: Record<TurnMode, string> = {
  DO: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  SAY: "border-[#b0869f]/40 bg-[#b0869f]/10 text-[#f0dfea]",
  LOOK: "border-[#7d91b8]/40 bg-[#7d91b8]/10 text-[#d3e1ff]",
};

type TurnInputProps = {
  adventureId: string;
  isSubmitting: boolean;
  error: string | null;
  onSubmitTurn: (input: { mode: TurnMode; playerText: string }) => Promise<boolean>;
  pressureStage?: PressureStage | null;
};

export default function TurnInput({ adventureId, isSubmitting, error, onSubmitTurn, pressureStage }: TurnInputProps) {
  const composerStage = pressureStage ?? "calm";
  const composerStyle = getPressureClasses(composerStage);
  const [mode, setMode] = useState<TurnMode>("DO");
  const [playerText, setPlayerText] = useState("");

  const canSubmit = Boolean(playerText.trim()) && !isSubmitting;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;

    const trimmed = playerText.trim();
    const success = await onSubmitTurn({ playerText: trimmed, mode });
    if (success) {
      setPlayerText("");
    }
  };

  const modeButtons = useMemo(
    () =>
      (["DO", "SAY", "LOOK"] as TurnMode[]).map((key) => {
        const active = mode === key;
        const activeClass = `${accentMap[key]} border border-white/10 shadow-[0_0_15px_rgba(0,0,0,0.45)]`;
        const inactiveClass = "border border-white/10 bg-black/10 text-[#a59e90] hover:text-[#f3efe6] hover:bg-white/5";
        return (
          <button
            key={key}
            type="button"
            onClick={() => setMode(key)}
            disabled={isSubmitting}
            className={`rounded-full px-4 py-2 text-sm font-semibold uppercase tracking-wide ${
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
      className={`${cardShell} ${cardPadding} space-y-4 transition-opacity duration-200 ${
        isSubmitting ? "opacity-70 pointer-events-none" : "opacity-100"
      } ${composerStyle.inputBorder} ${composerStage === "crisis" ? composerStyle.glow : ""}`}
    >
      <div className="space-y-1">
        <div className={sectionHeading}>Mode</div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-white/70">MODE: {mode}</span>
          <p className="text-xs text-white/60">{modeConfig[mode].description}</p>
        </div>
      </div>

      <div className="inline-flex flex-wrap gap-2 rounded-full border border-white/10 bg-black/20 p-1">
        {modeButtons}
      </div>

      <textarea
        name="playerText"
        value={playerText}
        onChange={(event) => setPlayerText(event.target.value)}
        placeholder={modeConfig[mode].placeholder}
        disabled={isSubmitting}
        className={`mt-2 min-h-[130px] w-full rounded-[18px] border border-white/10 bg-black/20 px-4 py-3 text-base text-[#f3efe6] placeholder:text-[#7e786d] focus:border-amber-300/30 focus:outline-none focus:ring-1 ${
          composerStage === "danger" ? "focus:ring-amber-400/30" : composerStage === "crisis" ? "focus:ring-rose-400/40" : "focus:ring-white/20"
        } disabled:cursor-not-allowed disabled:opacity-60`}
      />

      <div className="flex flex-col gap-2 text-xs text-white/60 sm:flex-row sm:items-center sm:justify-between">
        <p className="uppercase tracking-[0.3em] text-[#c9a35a]">
          Describe what you do, say, or examine. One action resolves one turn.
        </p>
        <button
          type="submit"
          disabled={!canSubmit}
          className={`inline-flex items-center justify-center rounded-full border px-5 py-2.5 text-sm font-medium uppercase tracking-[0.2em] transition duration-150 ${
            isSubmitting
              ? "bg-amber-400/20 text-amber-200 cursor-wait pointer-events-none shadow-[0_0_25px_rgba(201,163,90,0.4)]"
              : canSubmit
              ? `bg-amber-400/10 text-amber-200 ${composerStage === "danger" ? "border-amber-400/30" : composerStage === "crisis" ? "border-rose-400/30" : "border-amber-300/20"}`
              : "bg-amber-400/5 text-amber-100/80 cursor-not-allowed"}
          }`}
          >
            {isSubmitting ? "Resolving..." : "Take Turn"}
          </button>
        </div>

      {error ? <p className="text-xs text-rose-300">{error}</p> : null}
    </form>
  );
}
