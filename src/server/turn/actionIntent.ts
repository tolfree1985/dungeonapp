export type IntentMode = "DO" | "SAY" | "LOOK";

export type CanonicalVerb =
  | "inspect"
  | "search"
  | "open"
  | "pull"
  | "force"
  | "tip"
  | "move"
  | "kick"
  | "unknown";

export type ActionIntent = {
  mode: IntentMode;
  rawInput: string;
  normalizedInput: string;
  verb: CanonicalVerb;
  targetText?: string;
  qualifiers: string[];
  adverbs?: {
    speed?: "quick" | "careful" | "normal";
    force?: "gentle" | "firm" | "violent";
    stealth?: "quiet" | "normal";
  };
};

export function parseActionIntent(mode: IntentMode, rawInput: string): ActionIntent {
  const normalizedInput = rawInput.trim().toLowerCase();
  const qualifiers: string[] = [];
  if (normalizedInput.includes("quick")) qualifiers.push("quick");
  if (normalizedInput.includes("careful")) qualifiers.push("careful");
  if (normalizedInput.includes("quiet")) qualifiers.push("quiet");
  if (normalizedInput.includes("open")) qualifiers.push("open");
  const verb = detectVerb(normalizedInput, mode);
  const targetText = detectTargetText(normalizedInput);
  return {
    mode,
    rawInput,
    normalizedInput,
    verb,
    targetText,
    qualifiers,
    adverbs: {
      speed: normalizedInput.includes("quick")
        ? "quick"
        : normalizedInput.includes("careful")
          ? "careful"
          : "normal",
      stealth: normalizedInput.includes("quiet") ? "quiet" : "normal",
      force: normalizedInput.includes("kick") || normalizedInput.includes("slam")
        ? "violent"
        : normalizedInput.includes("force")
          ? "firm"
          : "gentle",
    },
  };
}

function detectVerb(input: string, mode: IntentMode): CanonicalVerb {
  const normalized = input.toLowerCase();

  if (
    normalized.includes("inspect") ||
    normalized.includes("examine") ||
    normalized.includes("study") ||
    normalized.includes("check") ||
    normalized.includes("look at")
  ) {
    return "inspect";
  }

  if (
    normalized.includes("search") ||
    normalized.includes("look through") ||
    normalized.includes("scan") ||
    normalized.includes("rummage")
  ) {
    return "search";
  }

  if (normalized.includes("force")) return "force";
  if (normalized.includes("pull")) return "pull";
  if (normalized.includes("tip")) return "tip";
  if (normalized.includes("move")) return "move";
  if (normalized.includes("open")) return "open";
  if (normalized.includes("kick")) return "kick";

  return "unknown";
}

function detectTargetText(input: string): string | undefined {
  const targets = ["door", "drawer", "crate", "desk", "cabinet", "room"];
  return targets.find((target) => input.includes(target));
}
