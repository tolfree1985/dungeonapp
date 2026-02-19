type TurnBlockArgs = {
  bundleId: string;
  turnIndex: string;
  engineVersion: string;
  scenarioContentHash: string;
  adventureId: string;
  latestTurnIndex: string;
  stateDeltas: unknown[];
  ledgerAdds: unknown[];
};

function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalize(entry));
  }
  if (value && typeof value === "object") {
    const input = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    const keys = Object.keys(input).sort(compareText);
    for (const key of keys) {
      out[key] = normalize(input[key]);
    }
    return out;
  }
  return value;
}

function stablePretty(value: unknown): string {
  return JSON.stringify(normalize(value), null, 2);
}

export function buildSupportTurnReproBlockText(args: TurnBlockArgs): string {
  return [
    "### Turn Repro Block",
    `Bundle ID: ${args.bundleId || "none"}`,
    `Turn Index: ${args.turnIndex || "none"}`,
    `Engine Version: ${args.engineVersion || "none"}`,
    `Scenario Hash: ${args.scenarioContentHash || "none"}`,
    `Adventure ID: ${args.adventureId || "none"}`,
    `Latest Turn Index: ${args.latestTurnIndex || "none"}`,
    "",
    "State Deltas:",
    stablePretty(args.stateDeltas),
    "",
    "Ledger Entries:",
    stablePretty(args.ledgerAdds),
  ].join("\n");
}
