export type TurnChangeItem = {
  label: string;
  kind: "progress" | "cost" | "hazard" | "opportunity" | "clue";
  priority: number;
};

type TurnChangesInput = {
  stateDeltas?: Array<any>;
  ledger?: Array<{ cause?: string; effect?: string } | null>;
};

const changeMatchers: Array<{ predicate: (delta: any | null, ledgerText: string) => boolean; item: TurnChangeItem }> = [
  {
    predicate: (delta, _) => delta?.kind === "flag.set" && delta.key === "scene.fire" && delta.value === true,
    item: { label: "Fire spread", kind: "hazard", priority: 100 },
  },
  {
    predicate: (delta, _) => delta?.kind === "flag.set" && delta.key === "crate.weakened" && delta.value === true,
    item: { label: "Crate weakened.", kind: "progress", priority: 96 },
  },
  {
    predicate: (delta, _) => delta?.kind === "flag.set" && delta.key === "container.crate_open" && delta.value === true,
    item: { label: "Crate opened.", kind: "progress", priority: 99 },
  },
  {
    predicate: (delta, _) => delta?.kind === "flag.set" && delta.key === "fabric.oiled" && delta.value === true,
    item: { label: "Fabric oiled", kind: "progress", priority: 90 },
  },
  {
    predicate: (_, ledgerText) => /clue|hidden/.test(ledgerText),
    item: { label: "Clue uncovered", kind: "clue", priority: 85 },
  },
  {
    predicate: (_, ledgerText) => /crate/.test(ledgerText) && /(open|pried)/.test(ledgerText),
    item: { label: "Crate opened", kind: "progress", priority: 95 },
  },
  {
    predicate: (_, ledgerText) => /crate/.test(ledgerText) && /(weakened|loosen)/.test(ledgerText),
    item: { label: "Crate weakened", kind: "progress", priority: 88 },
  },
  {
    predicate: (_, ledgerText) => /(movement|moved)/.test(ledgerText) && /(heavy|object)/.test(ledgerText),
    item: { label: "Signs of movement found", kind: "opportunity", priority: 70 },
  },
  {
    predicate: (delta, _) => delta?.kind === "pressure.add" && delta?.domain === "noise" && delta?.amount > 0,
    item: { label: "Noise increased", kind: "hazard", priority: 75 },
  },
  {
    predicate: (delta, _) => delta?.kind === "pressure.add" && delta?.domain === "danger" && delta?.amount > 0,
    item: { label: "Danger increased", kind: "hazard", priority: 80 },
  },
  {
    predicate: (delta, _) => delta?.kind === "pressure.add" && delta?.domain === "time" && delta?.amount > 0,
    item: { label: "Time advanced", kind: "cost", priority: 65 },
  },
];

function ledgerText(entry: any): string {
  if (!entry) return "";
  return [entry.cause, entry.effect]
    .filter(Boolean)
    .map((piece) => String(piece).toLowerCase())
    .join(" ");
}

export function buildTurnChanges(input: TurnChangesInput): TurnChangeItem[] {
  const collected: TurnChangeItem[] = [];
  const ledgerEntries = Array.isArray(input.ledger) ? input.ledger : [];

  if (Array.isArray(input.stateDeltas)) {
    for (const delta of input.stateDeltas) {
      const text = ledgerText({ cause: delta.key, effect: delta.value });
      for (const matcher of changeMatchers) {
        if (matcher.predicate(delta, text)) {
          collected.push({ ...matcher.item });
        }
      }
    }
  }

  for (const entry of ledgerEntries) {
    const text = ledgerText(entry);
    for (const matcher of changeMatchers) {
      if (matcher.predicate(null, text)) {
        collected.push({ ...matcher.item });
      }
    }
  }

  return collected
    .sort((a, b) => b.priority - a.priority)
    .filter((entry, index, arr) => arr.findIndex((other) => other.label === entry.label) === index)
    .slice(0, 4);
}

export type { TurnChangeItem, TurnChangesInput };
