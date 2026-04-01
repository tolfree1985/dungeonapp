import type { StateDelta, LedgerEntry } from "./resolveTurnContract";

type PressureConsequencesInput = {
  stateStats: Record<string, unknown>;
  stateFlags: Record<string, unknown>;
  deltas: StateDelta[];
};

const CONSEQUENCES = [
  {
    domain: "noise",
    threshold: 3,
    flag: "guard_alerted",
    action: "ALERT",
    effect: "Noise draws guard attention",
    detail: "Constant noise has alerted nearby guards.",
  },
  {
    domain: "noise",
    threshold: 5,
    flag: "guard_searching",
    action: "SEARCH",
    effect: "Guards begin actively searching the area",
    detail: "The racket is now forcing guards to search.",
  },
  {
    domain: "noise",
    threshold: 7,
    flag: "status_confrontation",
    action: "CONFRONTATION",
    effect: "The situation escalates into confrontation",
    detail: "Noise has become impossible to ignore.",
  },
  {
    domain: "suspicion",
    threshold: 3,
    flag: "npc_distrust",
    action: "DISTRUST",
    effect: "Suspicion breeds distrust",
    detail: "Characters start doubting your motives.",
  },
  {
    domain: "suspicion",
    threshold: 5,
    flag: "npc_resistant",
    action: "RESIST",
    effect: "Suspicion hardens into resistance",
    detail: "Your words are increasingly resisted.",
  },
  {
    domain: "suspicion",
    threshold: 7,
    flag: "npc_hostile",
    action: "HOSTILITY",
    effect: "Suspicion turns hostile",
    detail: "Suspicion has hardened into open hostility.",
  },
  {
    domain: "time",
    threshold: 4,
    flag: "opportunity_narrowed",
    action: "OPPORTUNITY",
    effect: "Opportunity window narrows",
    detail: "The delay is closing your available opportunity.",
  },
  {
    domain: "time",
    threshold: 6,
    flag: "opportunity_closed",
    action: "CLOSE",
    effect: "Opportunity window closes",
    detail: "The last chance slips away.",
  },
  {
    domain: "time",
    threshold: 8,
    flag: "scene_escalated",
    action: "ESCALATE",
    effect: "Time pressure escalates the scene",
    detail: "Lingering time pressure pushes the situation toward crisis.",
  },
];

function readFlag(record: Record<string, unknown> | null, key: string): boolean {
  if (!record) return false;
  const value = record[key];
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  return false;
}

export function resolvePressureConsequences({ stateStats, stateFlags, deltas }: PressureConsequencesInput) {
  const stats = stateStats ?? {};
  const baseTotals: Record<string, number> = {
    noise: Number(stats.noise ?? 0),
    suspicion: Number(stats.npcSuspicion ?? stats.suspicion ?? 0),
    time: Number(stats.timeAdvance ?? stats.time ?? 0),
    danger: Number(stats.positionPenalty ?? stats.danger ?? 0),
  };
  const deltaTotals: Record<string, number> = {
    noise: 0,
    suspicion: 0,
    time: 0,
    danger: 0,
  };
  for (const delta of deltas) {
    if (delta.kind === "pressure.add") {
      const domain = delta.domain;
      if (domain in deltaTotals) {
        deltaTotals[domain] = deltaTotals[domain] + delta.amount;
      }
    }
  }
  const projectedTotals: Record<string, number> = {
    noise: baseTotals.noise + deltaTotals.noise,
    suspicion: baseTotals.suspicion + deltaTotals.suspicion,
    time: baseTotals.time + deltaTotals.time,
    danger: baseTotals.danger + deltaTotals.danger,
  };

  const consequenceDeltas: StateDelta[] = [];
  const consequenceLedgers: LedgerEntry[] = [];
  const emittedFlags: string[] = [];

  for (const consequence of CONSEQUENCES) {
    const prev = baseTotals[consequence.domain] ?? 0;
    const current = projectedTotals[consequence.domain] ?? 0;
    if (prev < consequence.threshold && current >= consequence.threshold && !readFlag(stateFlags, consequence.flag)) {
      const delta: StateDelta = { kind: "flag.set", key: consequence.flag, value: true };
      consequenceDeltas.push(delta);
      consequenceLedgers.push({
        kind: "state_change",
        cause: "pressure",
        action: consequence.action,
        effect: consequence.effect,
        detail: consequence.detail,
        deltaKind: delta.kind,
      });
      emittedFlags.push(consequence.flag);
    }
  }

  console.log("pressure.consequence.projected", {
    previousPressure: baseTotals,
    projectedPressure: projectedTotals,
    emittedFlags,
  });

  return {
    stateDeltas: consequenceDeltas,
    ledgerAdds: consequenceLedgers,
  };
}
