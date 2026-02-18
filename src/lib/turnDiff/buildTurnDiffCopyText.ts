export type TurnDiffDelta = {
  path?: string | string[];
  op?: string;
  before?: unknown;
  after?: unknown;
  [k: string]: unknown;
};

export function classifyTurnImpact(args: {
  deltaCount: number;
  ledgerCount: number;
}): "Low" | "Medium" | "High" {
  const { deltaCount, ledgerCount } = args;

  if (deltaCount <= 2 && ledgerCount <= 2) return "Low";
  if (deltaCount <= 8 && ledgerCount <= 8) return "Medium";
  return "High";
}

function topLevelKeyFromPath(path: string | string[] | undefined): string | null {
  if (!path) return null;
  if (Array.isArray(path)) {
    const first = path[0];
    return typeof first === "string" && first.length ? first : null;
  }
  const p = String(path).trim();
  if (!p) return null;
  const cleaned = p.startsWith("/") ? p.slice(1) : p;
  const first = cleaned.split(/[./[\]]+/).filter(Boolean)[0];
  return first ? first : null;
}

export function getTurnDiffTopKeys(deltas: TurnDiffDelta[]): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();

  for (const d of deltas) {
    const k = topLevelKeyFromPath(d.path as string | string[] | undefined);
    if (k && !seen.has(k)) {
      seen.add(k);
      keys.push(k);
    }
  }

  keys.sort((a, b) => a.localeCompare(b));
  return keys;
}

export function compareTurnKeys(currentKeys: string[], previousKeys: string[]) {
  const current = new Set(currentKeys);
  const previous = new Set(previousKeys);

  const added = [...current].filter((k) => !previous.has(k)).sort();
  const removed = [...previous].filter((k) => !current.has(k)).sort();
  const unchanged = [...current].filter((k) => previous.has(k)).sort();

  return { added, removed, unchanged };
}

export function buildTurnDiffCopyText(args: {
  turnIndex: number | null;
  deltas: TurnDiffDelta[];
}): string {
  const { turnIndex, deltas } = args;
  const keys = getTurnDiffTopKeys(deltas);

  const header = `Turn diff${typeof turnIndex === "number" ? ` (turn ${turnIndex})` : ""}`;
  const lines: string[] = [header, `State delta entries: ${deltas.length}`, `Top-level keys: ${keys.length}`];

  if (keys.length) {
    lines.push(`Keys: ${keys.join(", ")}`);
  } else {
    lines.push("Keys: (none)");
  }

  return lines.join("\n");
}

export function buildFilteredDeltasCopyText(args: {
  turnIndex: number | null;
  deltas: TurnDiffDelta[];
  activeFilter: string;
}): string {
  const { turnIndex, deltas, activeFilter } = args;

  const header =
    "Filtered deltas"
    + (typeof turnIndex === "number" ? ` (turn ${turnIndex})` : "");

  const lines: string[] = [
    header,
    `Active filter: ${activeFilter}`,
    `Entries: ${deltas.length}`,
  ];

  for (const d of deltas) {
    const path = Array.isArray(d.path)
      ? d.path.join(".")
      : String(d.path ?? "");
    lines.push(`- ${path}`);
  }

  return lines.join("\n");
}

export function buildTurnImpactSummaryCopyText(args: {
  turnIndex: number | null;
  impact: "Low" | "Medium" | "High";
  deltaCount: number;
  ledgerCount: number;
  added: string[];
  removed: string[];
  unchanged: string[];
}): string {
  const header =
    "Turn impact summary"
    + (typeof args.turnIndex === "number" ? ` (turn ${args.turnIndex})` : "");

  const added = [...args.added].sort((a, b) => a.localeCompare(b));
  const removed = [...args.removed].sort((a, b) => a.localeCompare(b));
  const unchanged = [...args.unchanged].sort((a, b) => a.localeCompare(b));

  const lines = [
    header,
    `Impact: ${args.impact}`,
    `Deltas: ${args.deltaCount}`,
    `Ledger: ${args.ledgerCount}`,
    "Compared to previous turn",
    `Added: ${added.length > 0 ? added.join(", ") : "(none)"}`,
    `Removed: ${removed.length > 0 ? removed.join(", ") : "(none)"}`,
    `Unchanged: ${unchanged.length > 0 ? unchanged.join(", ") : "(none)"}`,
  ];

  return lines.join("\n");
}

export function buildTurnComparisonCopyText(args: {
  turnIndex: number | null;
  added: string[];
  removed: string[];
  unchanged: string[];
}): string {
  const header =
    "Turn comparison"
    + (typeof args.turnIndex === "number" ? ` (turn ${args.turnIndex})` : "");

  const added = [...args.added].sort((a, b) => a.localeCompare(b));
  const removed = [...args.removed].sort((a, b) => a.localeCompare(b));
  const unchanged = [...args.unchanged].sort((a, b) => a.localeCompare(b));

  return [
    header,
    "Compared to previous turn",
    `Added: ${added.length > 0 ? added.join(", ") : "(none)"}`,
    `Removed: ${removed.length > 0 ? removed.join(", ") : "(none)"}`,
    `Unchanged: ${unchanged.length > 0 ? unchanged.join(", ") : "(none)"}`,
  ].join("\n");
}
