export type ConsequenceScope = "persistent" | "turn";
export type ConsequenceCategory = "world" | "risk" | "opportunity";

export type ConsequenceLine = {
  scope: ConsequenceScope;
  category: ConsequenceCategory;
  priority: number;
  text: string;
};

export type TranslateConsequencesInput = {
  stateFlags?: Record<string, unknown> | null;
  stateDeltas?: Array<any>;
  ledgerAdds?: Array<any>;
};

function addUnique(lines: ConsequenceLine[], candidate: ConsequenceLine) {
  if (
    lines.some(
      (existing) =>
        existing.text === candidate.text && existing.scope === candidate.scope && existing.category === candidate.category
    )
  ) {
    return;
  }
  lines.push(candidate);
}

function collectFlags(flags?: Record<string, unknown> | null, stateDeltas?: Array<any>): Record<string, boolean> {
  const normalized: Record<string, boolean> = {};
  if (flags) {
    for (const [key, value] of Object.entries(flags)) {
      if (typeof value === "boolean") {
        normalized[key] = value;
      }
    }
  }
  if (Array.isArray(stateDeltas)) {
    for (const delta of stateDeltas) {
      if (!delta || typeof delta !== "object") continue;
      if (delta.kind !== "flag.set") continue;
      if (typeof delta.key !== "string") continue;
      const value = delta.value;
      if (value === true || value === false) {
        normalized[delta.key] = value;
      }
    }
  }
  return normalized;
}

export function translatePersistentFlags(flags?: Record<string, unknown> | null, stateDeltas?: Array<any>): ConsequenceLine[] {
  const lines: ConsequenceLine[] = [];
  const known = collectFlags(flags, stateDeltas);
  const hasFire = known["scene.fire"] === true;
  const hasAccelerant = known["scene.fire.accelerant"] === true;
  if (hasFire) {
    addUnique(lines, {
      scope: "persistent",
      category: "world",
      priority: hasAccelerant ? 100 : 90,
      text: hasAccelerant ? "The chamber is burning fast." : "The chamber is on fire.",
    });
  }
  if (known["fabric.oiled"]) {
    addUnique(lines, {
      scope: "persistent",
      category: "world",
      priority: 80,
      text: "Fabric is oil-soaked.",
    });
  }
  if (known["crate.weakened"]) {
    addUnique(lines, {
      scope: "persistent",
      category: "world",
      priority: 75,
      text: "The crate is weakened.",
    });
  }
  if (known["container.crate_open"]) {
    addUnique(lines, {
      scope: "persistent",
      category: "world",
      priority: 85,
      text: "The crate is open.",
    });
  }
  return lines;
}

function describePressureDelta(delta: any): ConsequenceLine | null {
  if (!delta || typeof delta !== "object") return null;
  if (delta.kind !== "pressure.add") return null;
  if (!delta.domain || typeof delta.domain !== "string") return null;

  const domain = delta.domain.toLowerCase();
  if (domain === "noise") {
    return {
      scope: "turn",
      category: "risk",
      priority: 60,
      text: "Noise increased.",
    };
  }
  if (domain === "time") {
    return {
      scope: "turn",
      category: "risk",
      priority: 55,
      text: "Time advanced.",
    };
  }
  if (domain === "danger") {
    return {
      scope: "turn",
      category: "risk",
      priority: 65,
      text: "Danger rose.",
    };
  }
  return null;
}

export function translateTurnDeltas(stateDeltas?: Array<any>): ConsequenceLine[] {
  const lines: ConsequenceLine[] = [];
  if (!Array.isArray(stateDeltas)) return lines;
  for (const delta of stateDeltas) {
    const entry = describePressureDelta(delta);
    if (entry) {
      addUnique(lines, entry);
    }
  }
  return lines;
}

function ledgerEntryText(entry: any): string {
  if (!entry) return "";
  const parts = [entry.effect, entry.ledgerText, entry.cause, entry.text, entry.detail, entry.description];
  return parts
    .filter(Boolean)
    .map((value) => String(value).trim())
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

type OpportunityMatcher = {
  predicate: (text: string) => boolean;
  line: ConsequenceLine;
};

const OPPORTUNITY_MATCHERS: OpportunityMatcher[] = [
  {
    predicate: (text) => text.includes("clue"),
    line: {
      scope: "turn",
      category: "opportunity",
      priority: 50,
      text: "A hidden clue was uncovered.",
    },
  },
  {
    predicate: (text) => text.includes("crate") && /(open|pried|search|splinter)/.test(text),
    line: {
      scope: "turn",
      category: "opportunity",
      priority: 75,
      text: "The crate can now be searched.",
    },
  },
  {
    predicate: (text) => text.includes("movement") && text.includes("heavy"),
    line: {
      scope: "turn",
      category: "opportunity",
      priority: 45,
      text: "You found signs something heavy was moved.",
    },
  },
  {
    predicate: (text) => text.includes("moved") && text.includes("heavy"),
    line: {
      scope: "turn",
      category: "opportunity",
      priority: 45,
      text: "You found signs something heavy was moved.",
    },
  },
  {
    predicate: (text) => /(route|passage|path)/.test(text),
    line: {
      scope: "turn",
      category: "opportunity",
      priority: 65,
      text: "A new route is available.",
    },
  },
];

function describeLedgerOpportunities(entry: any): ConsequenceLine[] {
  const text = ledgerEntryText(entry);
  if (!text) return [];
  const lines: ConsequenceLine[] = [];
  for (const matcher of OPPORTUNITY_MATCHERS) {
    if (matcher.predicate(text)) {
      addUnique(lines, { ...matcher.line });
    }
  }
  return lines;
}

export function translateLedgerOpportunities(ledgerAdds?: Array<any>): ConsequenceLine[] {
  const lines: ConsequenceLine[] = [];
  if (!Array.isArray(ledgerAdds)) return lines;
  for (const entry of ledgerAdds) {
    const matches = describeLedgerOpportunities(entry);
    for (const match of matches) {
      addUnique(lines, match);
    }
  }
  return lines;
}

export function translateConsequences(input: TranslateConsequencesInput): ConsequenceLine[] {
  const lines: ConsequenceLine[] = [];
  lines.push(...translatePersistentFlags(input.stateFlags, input.stateDeltas));
  lines.push(...translateTurnDeltas(input.stateDeltas));
  lines.push(...translateLedgerOpportunities(input.ledgerAdds));
  return lines;
}

export type { ConsequenceLine, TranslateConsequencesInput };
