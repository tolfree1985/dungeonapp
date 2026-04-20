import type { ReplayCase, ReplayRunResult, ReplayStepResult } from "@/lib/replay/replayTypes";
import { resolveReplayTurn } from "@/server/turn/resolveReplayTurn";

function cloneState<T>(value: T): T {
  return structuredClone(value);
}

export function runReplayCase(replayCase: ReplayCase): ReplayRunResult {
  let state = cloneState(replayCase.initialState);
  const steps: ReplayStepResult[] = [];

  for (let i = 0; i < replayCase.turns.length; i += 1) {
    const input = replayCase.turns[i];
    const result = resolveReplayTurn({
      state,
      input,
      seed: replayCase.seed,
      engineVersion: replayCase.engineVersion,
      scenarioHash: replayCase.scenarioHash,
      turnIndex: i + 1,
    });

    const finalState = cloneState(result.nextState);
    steps.push({
      turnIndex: i + 1,
      input,
      outcome: result.outcome,
      stateDeltas: cloneState(result.stateDeltas),
      ledgerAdds: cloneState(result.ledgerAdds),
      finalState,
      mechanicFacts: cloneState(result.mechanicFacts),
    });
    state = finalState;
  }

  return {
    caseId: replayCase.id,
    steps,
    finalState: state,
  };
}
