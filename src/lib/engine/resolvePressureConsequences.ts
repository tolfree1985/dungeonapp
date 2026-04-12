import type { StateDelta, LedgerEntry } from "./resolveTurnContract";
import { normalizeFlagKey } from "@/lib/engine/worldFlags";

type PressureConsequencesInput = {
  previousPressure: Record<string, number>;
  currentPressureAdds: StateDelta[];
  stateFlags: Record<string, unknown>;
};

export type PressureConsequencesResult = {
  stateDeltas: StateDelta[];
  ledgerAdds: LedgerEntry[];
  projectedPressure: Record<string, number>;
};

const CONSEQUENCES = [
  {
    domain: "noise",
    threshold: 3,
    flag: "guard.alerted",
    action: "ALERT",
    effect: "Noise draws guard attention",
    detail: "Constant noise has alerted nearby guards.",
  },
  {
    domain: "noise",
    threshold: 5,
    flag: "guard.searching",
    action: "SEARCH",
    effect: "Guards begin actively searching the area",
    detail: "The racket is now forcing guards to search.",
  },
  {
    domain: "noise",
    threshold: 7,
    flag: "status.confrontation",
    action: "CONFRONTATION",
    effect: "The situation escalates into confrontation",
    detail: "Noise has become impossible to ignore.",
  },
  {
    domain: "suspicion",
    threshold: 3,
    flag: "npc.distrust",
    action: "DISTRUST",
    effect: "Suspicion breeds distrust",
    detail: "Characters start doubting your motives.",
  },
  {
    domain: "suspicion",
    threshold: 5,
    flag: "npc.resistant",
    action: "RESIST",
    effect: "Suspicion hardens into resistance",
    detail: "Your words are increasingly resisted.",
  },
  {
    domain: "suspicion",
    threshold: 7,
    flag: "npc.hostile",
    action: "HOSTILITY",
    effect: "Suspicion turns hostile",
    detail: "Suspicion has hardened into open hostility.",
  },
  {
    domain: "time",
    threshold: 4,
    flag: "opportunity.narrowed",
    action: "OPPORTUNITY",
    effect: "Opportunity window narrows",
    detail: "The delay is closing your available opportunity.",
  },
  {
    domain: "time",
    threshold: 6,
    flag: "opportunity.closed",
    action: "CLOSE",
    effect: "Opportunity window closes",
    detail: "The last chance slips away.",
  },
  {
    domain: "time",
    threshold: 8,
    flag: "scene.escalated",
    action: "ESCALATE",
    effect: "Time pressure escalates the scene",
    detail: "Lingering time pressure pushes the situation toward crisis.",
  },
  {
    domain: "danger",
    threshold: 3,
    flag: "position.compromised",
    action: "EXPOSE",
    effect: "Escalating danger compromises your position",
    detail: "The rising danger leaves your position exposed.",
  },
  {
    domain: "danger",
    threshold: 5,
    flag: "escape.route_cut",
    action: "CUT_OFF",
    effect: "Danger cuts off the obvious escape route",
    detail: "The situation has become dangerous enough to close the clean exit.",
  },
  {
    domain: "danger",
    threshold: 7,
    flag: "status_confrontation",
    action: "CONFRONTATION",
    effect: "Danger escalates into direct confrontation",
    detail: "The danger can no longer be contained.",
  },
];

function readFlag(record: Record<string, unknown> | null, key: string): boolean {
  if (!record) return false;
  const normalizedKey = normalizeFlagKey(key);
  const value = record[normalizedKey] ?? record[key];
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  return false;
}

export function resolvePressureConsequences({
  previousPressure,
  currentPressureAdds,
  stateFlags,
}: PressureConsequencesInput): PressureConsequencesResult {
  const baseTotals: Record<string, number> = {
    noise: previousPressure.noise ?? 0,
    suspicion: previousPressure.suspicion ?? 0,
    time: previousPressure.time ?? 0,
    danger: previousPressure.danger ?? 0,
  };
  const deltaTotals: Record<string, number> = {
    noise: 0,
    suspicion: 0,
    time: 0,
    danger: 0,
  };
  for (const delta of currentPressureAdds) {
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
    projectedPressure: projectedTotals,
  };
}
