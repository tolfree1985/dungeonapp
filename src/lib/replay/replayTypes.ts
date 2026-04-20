import type { AdventureState } from "@/lib/engine/types/state";
import type { LedgerEntry, StateDelta } from "@/lib/engine/resolveTurnContract";
import type { MechanicFacts } from "@/lib/engine/presentation/mechanicFacts";

export type ReplayTurnInput = {
  mode: "DO" | "SAY" | "LOOK";
  text: string;
};

export type ReplayCase = {
  id: string;
  scenarioHash: string;
  engineVersion: string;
  seed: number;
  initialState: AdventureState;
  turns: ReplayTurnInput[];
};

export type ReplayStepResult = {
  turnIndex: number;
  input: ReplayTurnInput;
  outcome: string;
  stateDeltas: StateDelta[];
  ledgerAdds: LedgerEntry[];
  finalState: AdventureState;
  mechanicFacts: MechanicFacts;
};

export type ReplayRunResult = {
  caseId: string;
  steps: ReplayStepResult[];
  finalState: AdventureState;
};
