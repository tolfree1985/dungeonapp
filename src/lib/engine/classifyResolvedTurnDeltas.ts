import type { StateDelta } from "./resolveTurnContract";

export type DeltaClassification = {
  hasProgress: boolean;
  hasCost: boolean;
};

export function classifyResolvedTurnDeltas(deltas: StateDelta[]): DeltaClassification {
  let hasProgress = false;
  let hasCost = false;

  for (const delta of deltas) {
    const normalizedKind = (delta.kind ?? (delta as any).op ?? "").toLowerCase();
    const key = ((delta as any).key ?? "").toLowerCase();

    if (normalizedKind.includes("inventory.add") || normalizedKind.includes("inv.add")) {
      hasProgress = true;
    }

    if (normalizedKind.includes("inventory.remove") || normalizedKind.includes("inv.remove")) {
      hasCost = true;
    }

    if (normalizedKind.includes("quest.advance")) {
      hasProgress = true;
    }

    if (normalizedKind.includes("scene.set")) {
      hasProgress = true;
    }

    if (normalizedKind.includes("pressure.add")) {
      hasCost = true;
    }

    if (normalizedKind.includes("counter.add") || normalizedKind.includes("time.inc") || normalizedKind.includes("clock.inc")) {
      if (key.includes("time") || key.includes("cost") || key.includes("pressure") || key.includes("danger") || key.includes("risk") || key.includes("noise")) {
        hasCost = true;
      }
    }

    if (normalizedKind.includes("flag.set") || key.includes("flag.set")) {
      const progressKeywords = ["observed", "clue", "unlock", "found", "learned", "discovered", "quest", "insight", "progress"];
      const costKeywords = ["risk", "danger", "compromised", "alert", "pressure", "critical", "threat", "escalated", "exposed"];
      if (progressKeywords.some((prefix) => key.startsWith(prefix))) {
        hasProgress = true;
      }
      if (costKeywords.some((keyword) => key.includes(keyword))) {
        hasCost = true;
      }
    }

    if (normalizedKind.includes("relation.shift")) {
      const amount = (delta as any).amount;
      if (typeof amount === "number") {
        if (amount > 0) hasProgress = true;
        if (amount < 0) hasCost = true;
      }
    }
  }

  return { hasProgress, hasCost };
}
