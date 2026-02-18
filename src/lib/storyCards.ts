// src/lib/storyCards.ts

export type StoryCard = {
  id: string;
  title: string;
  kind: "fact" | "npc" | "clue" | "rule" | "location";
  text: string;
  tags: string[];
  triggers: {
    any?: string[];
    all?: string[];
    not?: string[];
  };
  priority: number;
  ttlTurns?: number;
  createdAtTurn?: number;
};

export type MemoryGate =
  | null
  | {
      gateId: "noise_interruption_v0";
      severity: "minor" | "major";
      reason: string;
      injectedCard: Pick<StoryCard, "id" | "title" | "kind" | "text" | "tags">;
      forcedOption: string;
    };

export type MemoryBundle = {
  injected: Array<Pick<StoryCard, "id" | "title" | "kind" | "text" | "tags">>;
  suppressedIds: string[];
  matchedIds: string[];
  gate: MemoryGate;
};

function normalize(s: string) {
  return (s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s:_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function contains(haystack: string, needle: string) {
  const h = normalize(haystack);
  const n = normalize(needle);
  if (!n) return false;
  return h.includes(n);
}

export function getStoryCardsFromState(state: any): StoryCard[] {
  const cards = state?.memory?.cards;
  return Array.isArray(cards) ? (cards as StoryCard[]) : [];
}

function getNoise(state: any): number {
  const clocks = state?.world?.clocks;
  if (!Array.isArray(clocks)) return 0;
  const noise = clocks.find((c: any) => c?.id === "clk_noise");
  const cur = noise?.current;
  return Number.isFinite(cur) ? Number(cur) : 0;
}

function computeMemoryGate(state: any): MemoryGate {
  const noise = getNoise(state);

  if (noise < 4) return null;

  const injectedCard = {
    id: "card_gate_noise_interruption_v0",
    title: "Interruption: someone heard you",
    kind: "rule" as const,
    text:
      "Your noise has attracted attention. An interruption is imminent unless you act quickly.",
    tags: ["gate", "clk_noise", "interruption", "pressure"],
  };

  return {
    gateId: "noise_interruption_v0",
    severity: noise >= 5 ? "major" : "minor",
    reason: `Noise clock is high (clk_noise.current = ${noise}).`,
    injectedCard,
    forcedOption: "Deal with the interruption (hide, distract, or confront).",
  };
}

export function selectStoryCards(args: {
  state: any;
  playerText: string;
  lastNarration?: string;
  turnIndex: number;
  maxCards?: number; // default 6
}): MemoryBundle {
  const maxCards = args.maxCards ?? 6;
  const cards = getStoryCardsFromState(args.state);

  const stateTags: string[] = Array.isArray(args.state?.memory?.tags) ? args.state.memory.tags : [];

  const ctx = ["always", args.playerText ?? "", args.lastNarration ?? "", stateTags.join(" ")].join(" | ");

  const nowTurn = args.turnIndex;

  const matched: StoryCard[] = [];
  const suppressedIds: string[] = [];

  for (const c of cards) {
    if (typeof c.ttlTurns === "number" && typeof c.createdAtTurn === "number") {
      if (nowTurn - c.createdAtTurn > c.ttlTurns) continue;
    }

    const any = c.triggers?.any ?? [];
    const all = c.triggers?.all ?? [];
    const not = c.triggers?.not ?? [];

    const isSuppressed =
      not.some((t) => contains(ctx, t)) || not.some((t) => stateTags.some((st) => contains(st, t)));

    if (isSuppressed) {
      suppressedIds.push(c.id);
      continue;
    }

    const allOk =
      all.length === 0 ? true : all.every((t) => contains(ctx, t) || stateTags.some((st) => contains(st, t)));
    if (!allOk) continue;

    const anyOk =
      any.length === 0 ? true : any.some((t) => contains(ctx, t) || stateTags.some((st) => contains(st, t)));
    if (!anyOk) continue;

    matched.push(c);
  }

  matched.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  const injected = matched.slice(0, maxCards).map((c) => ({
    id: c.id,
    title: c.title,
    kind: c.kind,
    text: c.text,
    tags: c.tags,
  }));

  const gate = computeMemoryGate(args.state);

  // Gate card is always appended if active (so it can't be “crowded out”)
  if (gate) injected.push(gate.injectedCard);

  return {
    injected,
    suppressedIds,
    matchedIds: matched.map((c) => c.id),
    gate,
  };
}

// Utility to enforce forced option when gate is active
export function applyMemoryGateToOptions(options: string[], gate: MemoryGate): string[] {
  if (!gate) return options;

  const forced = gate.forcedOption;
  const hasForced = options.some((o) => normalize(o) === normalize(forced));
  if (hasForced) return options;

  // Put forced option first (consequences visible)
  return [forced, ...options].slice(0, 5);
}
