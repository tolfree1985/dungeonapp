export type TurnInput = {
  mode: "DO" | "SAY" | "LOOK" | null;
  text: string;
};

export type ParsedInventoryIntent =
  | { kind: "take"; target: string }
  | { kind: "drop"; target: string }
  | { kind: "stash"; target: string; container?: string | null }
  | { kind: "light"; target: string }
  | { kind: "extinguish"; target: string }
  | { kind: "present"; target: string }
  | null;

const ITEM_ALIASES: Record<string, string[]> = {
  wax_seal_fragment: [
    "wax seal fragment",
    "seal fragment",
    "wax fragment",
    "seal",
  ],
  iron_lantern: [
    "iron lantern",
    "lantern",
    "lantern light",
  ],
  stolen_reliquary: [
    "stolen reliquary",
    "reliquary",
    "relic",
  ],
};

function normalizeIntentText(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\b(the|a|an|my)\b/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchInventoryTarget(normalized: string): string | null {
  for (const [target, aliases] of Object.entries(ITEM_ALIASES)) {
    for (const alias of aliases) {
      if (normalized.includes(alias)) {
        return target;
      }
    }
  }
  return null;
}

function includesTrigger(text: string, triggers: string[]): boolean {
  return triggers.some((trigger) => text.startsWith(trigger));
}

export function parseInventoryIntent(input: TurnInput): ParsedInventoryIntent {
  if (input.mode !== "DO" && input.mode !== "SAY") return null;

  const normalized = normalizeIntentText(input.text);
  const target = matchInventoryTarget(normalized) ?? normalized;

  if (input.mode === "DO") {
    if (includesTrigger(normalized, ["take", "pick up", "grab", "recover", "pocket"])) {
      return { kind: "take", target };
    }
    if (includesTrigger(normalized, ["drop", "discard", "throw down"])) {
      return { kind: "drop", target };
    }
    if (includesTrigger(normalized, ["stash", "hide", "tuck", "leave"])) {
      return { kind: "stash", target, container: null };
    }
    if (includesTrigger(normalized, ["light", "ignite"])) {
      return { kind: "light", target };
    }
    if (includesTrigger(normalized, ["extinguish", "snuff", "put out"])) {
      return { kind: "extinguish", target };
    }
  }

  if (input.mode === "SAY") {
    if (includesTrigger(normalized, ["look at this", "this seal", "this note", "i found"])) {
      return { kind: "present", target };
    }
  }

  return null;
}
