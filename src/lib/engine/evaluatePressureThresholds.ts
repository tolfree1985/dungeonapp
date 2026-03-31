import type { StateDelta } from "./resolveTurnContract";

const PRESSURE_THRESHOLDS: Record<string, number> = {
  suspicion: 3,
  noise: 3,
  time: 5,
  danger: 3,
};

export const THRESHOLD_FLAGS: Record<string, string> = {
  suspicion: "guard_alerted",
  noise: "area_compromised",
  time: "window_narrowed",
  danger: "situation_critical",
};

type EvaluatePressureThresholdsInput = {
  stateStats: Record<string, unknown> | null;
  deltas: StateDelta[];
};

export function evaluatePressureThresholds({ stateStats, deltas }: EvaluatePressureThresholdsInput): StateDelta[] {
  const stats = (stateStats ?? {}) as Record<string, number>;
  const baseTotals: Record<string, number> = {
    suspicion: Number(stats.npcSuspicion ?? stats.suspicion ?? 0),
    noise: Number(stats.noise ?? 0),
    time: Number(stats.timeAdvance ?? 0),
    danger: Number(stats.positionPenalty ?? stats.danger ?? 0),
  };
  const totals = { ...baseTotals };

  for (const delta of deltas) {
    if (delta.kind === "pressure.add") {
      const domain = delta.domain;
      if (domain in totals) {
        totals[domain] = totals[domain] + delta.amount;
      }
    }
  }

  const thresholdDeltas: StateDelta[] = [];
  for (const domain of Object.keys(PRESSURE_THRESHOLDS)) {
    const threshold = PRESSURE_THRESHOLDS[domain];
    const previous = baseTotals[domain] ?? 0;
    const current = totals[domain] ?? 0;
    if (previous < threshold && current >= threshold) {
      const flagKey = THRESHOLD_FLAGS[domain] ?? `pressure.${domain}`;
      thresholdDeltas.push({
        kind: "flag.set",
        key: flagKey,
        value: true,
      });
    }
  }

  return thresholdDeltas;
}
