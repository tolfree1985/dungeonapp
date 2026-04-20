import crypto from "node:crypto";
import type { ReplayRunResult } from "@/lib/replay/replayTypes";

function deepSort(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => deepSort(entry));
  }

  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return Object.keys(obj)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = deepSort(obj[key]);
        return acc;
      }, {});
  }

  return value;
}

export function canonicalReplaySnapshot(run: ReplayRunResult): unknown {
  return deepSort({
    caseId: run.caseId,
    steps: run.steps.map((step) => ({
      turnIndex: step.turnIndex,
      input: step.input,
      outcome: step.outcome,
      stateDeltas: step.stateDeltas,
      ledgerAdds: step.ledgerAdds,
      finalState: step.finalState,
      mechanicFacts: step.mechanicFacts,
    })),
    finalState: run.finalState,
  });
}

export function canonicalReplayStateSnapshot(state: unknown): unknown {
  return deepSort(state);
}

export function checksumReplayRun(run: ReplayRunResult): string {
  const json = JSON.stringify(canonicalReplaySnapshot(run));
  return crypto.createHash("sha256").update(json).digest("hex");
}

export function checksumReplayState(state: unknown): string {
  const json = JSON.stringify(canonicalReplayStateSnapshot(state));
  return crypto.createHash("sha256").update(json).digest("hex");
}
