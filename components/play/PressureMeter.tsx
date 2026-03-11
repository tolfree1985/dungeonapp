"use client";

import { useEffect, useRef, useState } from "react";
import { ui } from "@/lib/ui/classes";

type PressureStage = "calm" | "tension" | "danger" | "crisis";

const pressureOrder: PressureStage[] = ["calm", "tension", "danger", "crisis"];
const gradientMap: Record<PressureStage, string> = {
  calm: "from-emerald-500/60 to-emerald-300/50",
  tension: "from-amber-500/70 to-amber-300/60",
  danger: "from-orange-500/70 to-orange-300/60",
  crisis: "from-rose-500/80 to-rose-300/60",
};

function pressureLabelTone(stage: PressureStage) {
  switch (stage) {
    case "calm":
      return "border-emerald-300/30 bg-emerald-500/10 text-emerald-200";
    case "tension":
      return "border-amber-400/30 bg-amber-500/10 text-amber-200";
    case "danger":
      return "border-orange-400/30 bg-orange-500/10 text-orange-200";
    case "crisis":
      return "border-rose-400/30 bg-rose-500/10 text-rose-200";
    default:
      return "border-white/20 bg-white/5 text-white";
  }
}

type PressureMeterProps = {
  currentStage?: string | null;
  panelTone?: string;
};

export default function PressureMeter({ currentStage, panelTone }: PressureMeterProps) {
  const normalized = (currentStage ?? "calm").toLowerCase();
  const activeStage: PressureStage = pressureOrder.includes(normalized as PressureStage)
    ? (normalized as PressureStage)
    : "calm";
  const activeIndex = pressureOrder.indexOf(activeStage);
  const [pulse, setPulse] = useState(false);
  const prevStageRef = useRef<PressureStage>(activeStage);

  useEffect(() => {
    const prevStage = prevStageRef.current;
    const prevIndex = pressureOrder.indexOf(prevStage);
    if (activeStage !== prevStage) {
      prevStageRef.current = activeStage;
      if (activeIndex > prevIndex) {
        setPulse(true);
        const timer = setTimeout(() => setPulse(false), 420);
        return () => clearTimeout(timer);
      }
    }
    prevStageRef.current = activeStage;
    return undefined;
  }, [activeStage, activeIndex]);
  const toneClass = panelTone ? ` ${panelTone}` : "";

  return (
    <div className={`${ui.panel} p-5${toneClass} ${pulse ? "animate-[pressurePulse_420ms_ease]" : ""}`}>
      <div className="flex items-center justify-between">
        <div className={ui.sectionLabel}>Pressure</div>
        <span className={`hud-chip text-[11px] ${pressureLabelTone(activeStage)}`}>{activeStage}</span>
      </div>
      <div className="mt-4 grid grid-cols-4 gap-3">
        {pressureOrder.map((stage, index) => {
          const isActive = index <= activeIndex;
          return (
            <div key={stage} className="space-y-2">
              <div
                className={[
                  "h-2 rounded-full border border-white/10",
                  isActive ? `bg-gradient-to-r ${gradientMap[stage]}` : "bg-white/5",
                ].join(" ")}
              />
              <div className="text-center text-[10px] uppercase tracking-[0.18em] text-[#a59e90]">
                {stage}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
