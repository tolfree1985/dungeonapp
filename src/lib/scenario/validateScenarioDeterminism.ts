import { ALLOWED_STATE_NAMESPACES } from "../game/replay";

const STYLE_LOCK_KEYS = new Set(["toneLock", "genreLock", "pacingLock"]);
const STYLE_LOCK_ALLOWED_VALUES = new Set(["none", "unlocked", "locked"]);

function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizePath(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (Array.isArray(value)) {
    const parts = value
      .map((part) => String(part).trim())
      .filter((part) => part.length > 0);
    return parts.length > 0 ? parts.join(".") : null;
  }
  return null;
}

function getPathNamespace(path: string): string {
  const cleaned = path.startsWith("/") ? path.slice(1) : path;
  return cleaned.split(/[./[\]]+/).filter(Boolean)[0] ?? "";
}

function hasUndefinedValue(value: unknown): boolean {
  if (value === undefined) return true;
  if (Array.isArray(value)) {
    return value.some((entry) => hasUndefinedValue(entry));
  }
  if (isRecord(value)) {
    const keys = Object.keys(value).sort(compareText);
    for (const key of keys) {
      if (hasUndefinedValue(value[key])) return true;
    }
  }
  return false;
}

function hasFloatValue(value: unknown): boolean {
  if (typeof value === "number") {
    return !Number.isInteger(value);
  }
  if (Array.isArray(value)) {
    return value.some((entry) => hasFloatValue(entry));
  }
  if (isRecord(value)) {
    const keys = Object.keys(value).sort(compareText);
    for (const key of keys) {
      if (hasFloatValue(value[key])) return true;
    }
  }
  return false;
}

type ScriptedTurn = {
  turnIndex: number;
  deltas: unknown[];
  ledgerAdds: unknown[];
  tags: string[];
};

function toTurnIndex(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return Number(value.trim());
  return fallback;
}

function readTags(turn: unknown): string[] {
  if (!isRecord(turn)) return [];
  const candidates = [
    turn.tags,
    turn.turnTags,
    isRecord(turn.meta) ? turn.meta.tags : undefined,
    isRecord(turn.turnJson) && isRecord(turn.turnJson.meta) ? turn.turnJson.meta.tags : undefined,
  ];
  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue;
    return candidate
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }
  return [];
}

function extractTurns(scenarioJson: unknown): ScriptedTurn[] {
  if (!isRecord(scenarioJson)) return [];
  const rawTurns = Array.isArray(scenarioJson.turns)
    ? scenarioJson.turns
    : Array.isArray(scenarioJson.events)
      ? scenarioJson.events
      : Array.isArray(scenarioJson.scriptedTurns)
        ? scenarioJson.scriptedTurns
        : [];

  return rawTurns.map((turn, index) => {
    const source = isRecord(turn) ? turn : {};
    const turnJson = isRecord(source.turnJson) ? source.turnJson : {};
    const deltas = Array.isArray(source.stateDeltas)
      ? source.stateDeltas
      : Array.isArray(source.deltas)
        ? source.deltas
        : Array.isArray(turnJson.deltas)
          ? turnJson.deltas
          : [];
    const ledgerAdds = Array.isArray(source.ledgerAdds)
      ? source.ledgerAdds
      : Array.isArray(turnJson.ledgerAdds)
        ? turnJson.ledgerAdds
        : [];
    const turnIndex = toTurnIndex(source.turnIndex ?? source.seq, index);
    return {
      turnIndex,
      deltas,
      ledgerAdds,
      tags: readTags(turn),
    };
  });
}

function readStyleLockValueFromInitialState(
  scenarioJson: unknown,
  key: string,
): unknown {
  if (!isRecord(scenarioJson)) return undefined;
  const initialState = isRecord(scenarioJson.initialState) ? scenarioJson.initialState : null;
  if (!initialState) return undefined;
  if (isRecord(initialState.flags) && key in initialState.flags) {
    return initialState.flags[key];
  }
  if (isRecord(initialState.world) && isRecord(initialState.world.flags) && key in initialState.world.flags) {
    return initialState.world.flags[key];
  }
  return undefined;
}

function styleLockKeyFromDelta(delta: unknown): string | null {
  if (!isRecord(delta)) return null;
  const path = normalizePath(delta.path);
  if (path) {
    const normalized = path.startsWith("/") ? path.slice(1) : path;
    if (normalized.startsWith("flags.")) {
      const key = normalized.slice("flags.".length);
      return STYLE_LOCK_KEYS.has(key) ? key : null;
    }
    if (normalized.startsWith("world.flags.")) {
      const key = normalized.slice("world.flags.".length);
      return STYLE_LOCK_KEYS.has(key) ? key : null;
    }
  }
  if (
    typeof delta.op === "string" &&
    delta.op.trim() === "flag.set" &&
    typeof delta.key === "string" &&
    STYLE_LOCK_KEYS.has(delta.key)
  ) {
    return delta.key;
  }
  return null;
}

function styleLockNextValueFromDelta(delta: unknown): unknown {
  if (!isRecord(delta)) return undefined;
  if (typeof delta.op === "string") {
    const op = delta.op.trim().toLowerCase();
    if (op.includes("unset") || op.includes("delete") || op.includes("remove")) {
      return undefined;
    }
  }
  if ("value" in delta) {
    return delta.value;
  }
  return undefined;
}

export function validateScenarioDeterminism(scenarioJson: unknown): {
  valid: boolean;
  errors: string[];
} {
  const errors = new Set<string>();
  const turns = extractTurns(scenarioJson);
  const seenTurnIndexes = new Set<number>();

  const styleLockState = new Map<string, unknown>();
  for (const key of STYLE_LOCK_KEYS) {
    const value = readStyleLockValueFromInitialState(scenarioJson, key);
    if (value !== undefined) {
      styleLockState.set(key, value);
    }
  }

  const sortedTurns = [...turns].sort((a, b) => a.turnIndex - b.turnIndex);

  for (const turn of sortedTurns) {
    if (seenTurnIndexes.has(turn.turnIndex)) {
      errors.add("SCENARIO_TURN_INDEX_INVALID");
    }
    seenTurnIndexes.add(turn.turnIndex);

    const hasSystemNoLedger = turn.tags.includes("system/no-ledger");
    if (turn.deltas.length > 0 && turn.ledgerAdds.length === 0 && !hasSystemNoLedger) {
      errors.add("SCENARIO_LEDGER_DELTA_MISMATCH");
    }
    if (turn.ledgerAdds.length > 0 && turn.deltas.length === 0) {
      errors.add("SCENARIO_LEDGER_DELTA_MISMATCH");
    }

    for (const delta of turn.deltas) {
      if (hasUndefinedValue(delta)) {
        errors.add("SCENARIO_UNDEFINED_DELTA_VALUE");
      }
      if (isRecord(delta)) {
        const path = normalizePath(delta.path);
        if (path) {
          const namespace = getPathNamespace(path);
          if (!ALLOWED_STATE_NAMESPACES.has(namespace)) {
            errors.add("SCENARIO_DELTA_NAMESPACE_INVALID");
          }
          if (path.startsWith("stats.") && hasFloatValue(delta)) {
            errors.add("SCENARIO_FLOAT_STAT_MUTATION");
          }
        }

        const styleKey = styleLockKeyFromDelta(delta);
        if (styleKey) {
          const current = styleLockState.get(styleKey);
          const next = styleLockNextValueFromDelta(delta);
          if (current !== undefined && next === undefined) {
            errors.add("SCENARIO_STYLE_LOCK_VIOLATION");
          }
          if (next !== undefined) {
            if (typeof next !== "string" || !STYLE_LOCK_ALLOWED_VALUES.has(next)) {
              errors.add("SCENARIO_STYLE_LOCK_VIOLATION");
            } else {
              if (current === "locked" && next !== "locked") {
                errors.add("SCENARIO_STYLE_LOCK_VIOLATION");
              }
              styleLockState.set(styleKey, next);
            }
          }
        }
      }
    }
  }

  const sortedErrors = [...errors].sort(compareText);
  return {
    valid: sortedErrors.length === 0,
    errors: sortedErrors,
  };
}
