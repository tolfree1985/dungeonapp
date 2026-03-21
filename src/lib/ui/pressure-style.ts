import type { PressureStage } from "@/app/play/types";

export const pressureStyle: Record<
  PressureStage,
  Readonly<{ text: string; border: string; glow?: string; container: string; inputBorder: string }>
> = {
  calm: {
    text: "text-white/80",
    border: "border-white/10",
    glow: "",
    container: "border-white/10",
    inputBorder: "border-white/5",
  },
  tension: {
    text: "text-white",
    border: "border-white/20",
    glow: "",
    container: "border-white/20",
    inputBorder: "border-white/10",
  },
  danger: {
    text: "text-amber-200",
    border: "border-amber-500/30",
    glow: "",
    container: "border-amber-500/30",
    inputBorder: "border-amber-500/20",
  },
  crisis: {
    text: "text-rose-300 font-semibold",
    border: "border-rose-500/40",
    glow: "shadow-[0_0_20px_rgba(244,63,94,0.15)]",
    container: "border-rose-500/40 shadow-[0_0_20px_rgba(244,63,94,0.15)]",
    inputBorder: "border-rose-500/25",
  },
} as const;

export type PressureStyle = (typeof pressureStyle)[PressureStage];

export function getPressureStyle(stage: PressureStage) {
  return pressureStyle[stage];
}

export function getPressureClasses(stage: PressureStage) {
  const style = getPressureStyle(stage);
  return {
    text: style.text,
    border: style.border,
    glow: style.glow,
    container: `${style.border} ${style.glow}`.trim(),
  };
}

export function pressureTextClass(stage: PressureStage) {
  return getPressureClasses(stage).text;
}

export function pressureBorderClass(stage: PressureStage) {
  return getPressureClasses(stage).container;
}
