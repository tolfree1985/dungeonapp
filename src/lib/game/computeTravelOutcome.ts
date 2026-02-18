// src/lib/game/computeTravelOutcome.ts

export type RollTier = "HIT" | "COST" | "FAIL";

export type TravelOutcome =
  | { kind: "arrive.clean"; destinationId: string }
  | {
      kind: "arrive.cost";
      destinationId: string;
      costs: Array<{ kind: "noise"; amount: number }>;
    }
  | {
      kind: "arrive.compromised";
      destinationId: string;
      intercept: { kind: "patrol_spotted" };
      costs: Array<{ kind: "noise"; amount: number }>;
    }
  | { kind: "blocked"; reason: "illegal_exit" | "locked" | "blocked" };

type Args = {
  fromId: string;
  toId: string;
  tier: RollTier;
  exit: { exists: boolean; locked?: boolean; blocked?: boolean };
};

export function computeTravelOutcome(args: Args): TravelOutcome {
  const { toId, tier, exit } = args;

  if (!exit.exists) return { kind: "blocked", reason: "illegal_exit" };
  if (exit.locked) return { kind: "blocked", reason: "locked" };
  if (exit.blocked) return { kind: "blocked", reason: "blocked" };

  if (tier === "HIT") {
    return { kind: "arrive.clean", destinationId: toId };
  }

  if (tier === "COST") {
    return {
      kind: "arrive.cost",
      destinationId: toId,
      costs: [{ kind: "noise", amount: 1 }],
    };
  }

  // FAIL-forward (IN): you still arrive, but worse
  return {
    kind: "arrive.compromised",
    destinationId: toId,
    intercept: { kind: "patrol_spotted" },
    costs: [{ kind: "noise", amount: 2 }],
  };
}
