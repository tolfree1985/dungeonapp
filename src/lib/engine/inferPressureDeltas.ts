import type { StateDelta } from "./resolveTurnContract";
import type { OutcomeTier } from "./resolveTurnContract";

export type InferPressureInput = {
  mode: "DO" | "SAY" | "LOOK";
  outcomeTier: OutcomeTier;
  tags?: string[] | null;
};

export function inferPressureDeltas(input: InferPressureInput): StateDelta[] {
  const deltas: StateDelta[] = [];
  const { mode, outcomeTier } = input;
  const requiresCost = outcomeTier === "success_with_cost" || outcomeTier === "mixed";

  if (requiresCost) {
    if (mode === "LOOK") {
      deltas.push({ kind: "pressure.add", domain: "time", amount: 1 });
    }
    if (mode === "DO") {
      deltas.push({ kind: "pressure.add", domain: "noise", amount: 1 });
      deltas.push({ kind: "pressure.add", domain: "danger", amount: 1 });
    }
    if (mode === "SAY") {
      deltas.push({ kind: "pressure.add", domain: "suspicion", amount: 1 });
    }
  }

  if (outcomeTier === "failure_with_progress") {
    deltas.push({ kind: "pressure.add", domain: "time", amount: 1 });
    deltas.push({ kind: "pressure.add", domain: "suspicion", amount: 1 });
  }

  return deltas;
}
