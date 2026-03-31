export type IntentMode = "DO" | "SAY" | "LOOK";
export type WatchfulnessLevel = "normal" | "elevated" | "high" | "hostile";
export type WatchfulnessActionFlags = {
  stealthDisadvantage: boolean;
  deceptionDisadvantage: boolean;
};

const VALID_INTENT_MODES: IntentMode[] = ["DO", "SAY", "LOOK"];

function normalizeIntentMode(value: string | null | undefined): IntentMode | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  if (VALID_INTENT_MODES.includes(normalized as IntentMode)) {
    return normalized as IntentMode;
  }
  return null;
}

export function deriveIntentMode(action: string | null | undefined, playerText: string | null | undefined): IntentMode {
  const explicitMode = normalizeIntentMode(action);
  if (explicitMode) return explicitMode;
  const text = playerText?.trim();
  if (text) {
    const match = text.match(/^([A-Za-z]+):\s*/);
    if (match) {
      const parsed = normalizeIntentMode(match[1]);
      if (parsed) return parsed;
    }
  }
  return "DO";
}

export { normalizeIntentMode };

export function resolveWatchfulnessActionFlags(params: {
  watchfulness: WatchfulnessLevel;
  mode: IntentMode;
}): WatchfulnessActionFlags {
  const { watchfulness, mode } = params;
  return {
    stealthDisadvantage:
      mode === "DO" && (watchfulness === "high" || watchfulness === "hostile"),
    deceptionDisadvantage:
      mode === "SAY" && (watchfulness === "elevated" || watchfulness === "high" || watchfulness === "hostile"),
  };
}
