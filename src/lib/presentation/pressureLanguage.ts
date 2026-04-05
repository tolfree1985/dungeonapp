export type PressureAxis = "suspicion" | "noise" | "time" | "danger";
export type PressureTone = "stable" | "rising" | "danger" | "critical";

export type PressureSummary = {
  title: string;
  tone: PressureTone;
  axis: PressureAxis;
};

const AXIS_LABELS: Record<PressureAxis, string> = {
  suspicion: "Suspicion",
  noise: "Noise",
  time: "Time",
  danger: "Danger",
};

const AXIS_SUMMARY: Record<PressureAxis, string> = {
  suspicion: "Suspicion is tightening. Watch your friends and foes equally.",
  noise: "Noise is rising—it won’t stay quiet for long.",
  time: "Time is slipping through your fingers.",
  danger: "Danger nears. A mistake now could be costly.",
};

const TONE_LABELS: Record<PressureTone, string> = {
  stable: "Calm",
  rising: "Uneasy",
  danger: "Tense",
  critical: "Hunted",
};

const TONE_THRESHOLDS: Record<PressureTone, number> = {
  stable: 0,
  rising: 40,
  danger: 70,
  critical: 90,
};

function dominantAxis(totals: Record<PressureAxis, number>): PressureAxis {
  return (Object.keys(totals) as PressureAxis[]).reduce((winner, axis) =>
    totals[axis] > totals[winner] ? axis : winner,
  );
}

function pressureTone(value: number): PressureTone {
  if (value >= TONE_THRESHOLDS.critical) return "critical";
  if (value >= TONE_THRESHOLDS.danger) return "danger";
  if (value >= TONE_THRESHOLDS.rising) return "rising";
  return "stable";
}

export function describePressureSummary(totals: Record<PressureAxis, number>): PressureSummary {
  const axis = dominantAxis(totals);
  const value = totals[axis];
  const tone = pressureTone(value);
  return {
    title: `${AXIS_LABELS[axis]} — ${TONE_LABELS[tone]}`,
    tone,
    axis,
  };
}

export function describeMetric(axis: PressureAxis, value: number): string {
  const label = AXIS_LABELS[axis];
  let detail = "Stable";
  if (value >= 80) detail = "Extreme";
  else if (value >= 60) detail = "High";
  else if (value >= 40) detail = "Rising";
  else if (value >= 20) detail = "Low";
  return `${label} — ${detail}`;
}

export function describeMetricDetail(axis: PressureAxis, value: number): string {
  const tone = pressureTone(value);
  switch (axis) {
    case "noise":
      if (tone === "critical") return "The wing won’t stay quiet for long.";
      if (tone === "danger") return "Every footstep echoes.";
      if (tone === "rising") return "Sound is building around you.";
      return "Silence still protects you.";
    case "suspicion":
      if (tone === "critical") return "Everyone is looking for your betrayal.";
      if (tone === "danger") return "Eyes track your every move.";
      if (tone === "rising") return "Suspicion is poised to snap.";
      return "No one is paying you special attention.";
    case "time":
      if (tone === "critical") return "The night collapses on your deadline.";
      if (tone === "danger") return "You are out of time for caution.";
      if (tone === "rising") return "Minutes slip through shadowed halls.";
      return "You can take a breath and compose yourself.";
    case "danger":
      if (tone === "critical") return "A misstep now could spell defeat.";
      if (tone === "danger") return "Threat is breathing down your neck.";
      if (tone === "rising") return "Risk is edging closer.";
      return "Danger remains muted for the time being.";
  }
}

export function describeTurnPressure(changes: Array<{ domain: string; amount: number }>) {
  if (!changes.length) return null;
  const significant = changes.reduce((best, change) => {
    if (!best || change.amount > best.amount) return change;
    return best;
  });
  const dominated: PressureAxis = (significant.domain as PressureAxis) ?? "danger";
  const tone = pressureTone(Math.abs(significant.amount));
  if (tone === "critical") return `Pressure surges: ${AXIS_SUMMARY[dominated]}`;
  if (tone === "danger") return `Pressure spikes: ${AXIS_SUMMARY[dominated]}`;
  if (tone === "rising") return `Pressure rises: ${AXIS_SUMMARY[dominated]}`;
  return `Pressure shifts: ${AXIS_SUMMARY[dominated]}`;
}

export function pressureToneLabel(tone: PressureTone): string {
  return TONE_LABELS[tone];
}
