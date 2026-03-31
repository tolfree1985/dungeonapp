export type OutcomeTier =
  | "success"
  | "success_with_cost"
  | "mixed"
  | "failure_with_progress"
  | "failure";

export type StateDelta =
  | { kind: "flag.set"; key: string; value: boolean }
  | { kind: "counter.add"; key: string; amount: number }
  | { kind: "relation.shift"; actorId: string; metric: string; amount: number }
  | { kind: "inventory.add"; itemId: string; quantity: number }
  | { kind: "inventory.remove"; itemId: string; quantity: number }
  | { kind: "quest.advance"; questId: string; step: string }
  | { kind: "pressure.add"; domain: string; amount: number }
  | { kind: "scene.set"; sceneId: string };

export type LedgerEntry = {
  kind: "state_change";
  cause: "Turn resolution";
  effect: string;
  deltaKind: StateDelta["kind"];
};

export type SceneUpdate = {
  locationId?: string | null;
  sceneId?: string | null;
  tags?: string[];
} | null;

export type ResolvedTurn = {
  outcome: {
    tier: OutcomeTier;
    roll: {
      formula: string;
      total: number;
      difficulty: number;
      margin: number;
    } | null;
  };
  stateDeltas: StateDelta[];
  ledgerAdds: LedgerEntry[];
  sceneUpdate: SceneUpdate;
  presentation: {
    sceneText: string;
    consequenceText: string[];
  };
};

export function resolveOutcomeTier(input: {
  rollTotal: number;
  difficulty: number;
}): OutcomeTier {
  const margin = input.rollTotal - input.difficulty;

  if (margin >= 4) return "success";
  if (margin >= 1) return "success_with_cost";
  if (margin === 0) return "mixed";
  if (margin >= -2) return "failure_with_progress";
  return "failure";
}

export function buildLedgerFromDeltas(deltas: StateDelta[]): LedgerEntry[] {
  const ledger: LedgerEntry[] = [];

  for (const delta of deltas) {
    switch (delta.kind) {
      case "counter.add":
        ledger.push({
          kind: "state_change",
          cause: "Turn resolution",
          effect: `${delta.key} ${delta.amount >= 0 ? "+" : ""}${delta.amount}`,
          deltaKind: delta.kind,
        });
        break;

      case "flag.set":
        ledger.push({
          kind: "state_change",
          cause: "Turn resolution",
          effect: `${delta.key} set to ${String(delta.value)}`,
          deltaKind: delta.kind,
        });
        break;

      case "pressure.add":
        ledger.push({
          kind: "state_change",
          cause: "Turn resolution",
          effect: `${delta.domain} pressure +${delta.amount}`,
          deltaKind: delta.kind,
        });
        break;

      case "scene.set":
        ledger.push({
          kind: "state_change",
          cause: "Turn resolution",
          effect: `Scene changed to ${delta.sceneId}`,
          deltaKind: delta.kind,
        });
        break;

      default:
        ledger.push({
          kind: "state_change",
          cause: "Turn resolution",
          effect: delta.kind,
          deltaKind: delta.kind,
        });
    }
  }

  return ledger;
}
