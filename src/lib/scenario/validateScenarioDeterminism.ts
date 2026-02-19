import {
  ALLOWED_STATE_NAMESPACES,
  classifyConsequence,
  readLedgerStakesRiskOverride,
  type ConsequenceRiskLevel,
} from "../game/replay";

const STYLE_LOCK_KEYS = new Set(["toneLock", "genreLock", "pacingLock"]);
const STYLE_LOCK_ALLOWED_VALUE_LIST = ["none", "unlocked", "locked"].sort(compareText);
const STYLE_LOCK_ALLOWED_VALUES = new Set(STYLE_LOCK_ALLOWED_VALUE_LIST);
const CONSEQUENCE_RISK_ORDER: ConsequenceRiskLevel[] = ["LOW", "MODERATE", "HIGH"];

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
  isFailure: boolean;
  hasBranchTransition: boolean;
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

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().toLowerCase();
  return text.length > 0 ? text : null;
}

function isFailureResolution(source: unknown): boolean {
  if (!isRecord(source)) return false;
  const resolution = isRecord(source.resolution) ? source.resolution : null;
  const candidates = [
    resolution?.tier,
    resolution?.outcome,
    resolution?.band,
    source.outcome,
    source.tier,
    source.band,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeText(candidate);
    if (!normalized) continue;
    if (normalized === "fail" || normalized === "failure" || normalized === "fail-forward") {
      return true;
    }
    if (normalized.includes("fail")) {
      return true;
    }
    if (normalized === "2-6") {
      return true;
    }
  }
  if (resolution && typeof resolution.total === "number" && Number.isFinite(resolution.total)) {
    return resolution.total <= 6;
  }
  return false;
}

function hasBranchTransition(source: unknown): boolean {
  if (!isRecord(source)) return false;
  const directCandidates = [
    source.next,
    source.nextTurn,
    source.nextTurnIndex,
    source.nextSeq,
    source.nextSceneId,
    source.nextBranch,
    source.branch,
  ];
  for (const candidate of directCandidates) {
    if (typeof candidate === "number" && Number.isInteger(candidate)) return true;
    if (typeof candidate === "string" && candidate.trim().length > 0) return true;
  }
  const branches = isRecord(source.branches) ? source.branches : null;
  if (branches) {
    const branchCandidates = [branches.fail, branches.failure, branches.onFail];
    for (const candidate of branchCandidates) {
      if (typeof candidate === "number" && Number.isInteger(candidate)) return true;
      if (typeof candidate === "string" && candidate.trim().length > 0) return true;
      if (isRecord(candidate)) {
        if (
          (typeof candidate.next === "number" && Number.isInteger(candidate.next)) ||
          (typeof candidate.next === "string" && candidate.next.trim().length > 0)
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

function isQuestFlagStatMutation(delta: unknown): boolean {
  if (!isRecord(delta)) return false;
  const path = normalizePath(delta.path);
  if (path) {
    const namespace = getPathNamespace(path);
    if (namespace === "quests" || namespace === "flags" || namespace === "stats") {
      return true;
    }
  }
  const op = normalizeText(delta.op);
  if (!op) return false;
  return op.startsWith("quest.") || op.startsWith("flag.") || op.startsWith("stats.");
}

const MEANINGFUL_FAILURE_NAMESPACES = new Set(["quests", "stats", "relationships", "inventory"]);
const TRIVIAL_FAILURE_FLAG_KEYS = new Set(["failed", "failed_once", "failedonce"]);

function namespaceForDelta(delta: unknown): string {
  if (!isRecord(delta)) return "";
  const path = normalizePath(delta.path);
  if (!path) return "";
  return getPathNamespace(path);
}

function flagKeyForDelta(delta: unknown): string {
  if (!isRecord(delta)) return "";
  const path = normalizePath(delta.path);
  if (path) {
    const cleaned = path.startsWith("/") ? path.slice(1) : path;
    const parts = cleaned.split(/[./[\]]+/).filter(Boolean);
    if (parts[0] === "flags" && parts[1]) return parts[1].trim();
    if (parts[0] === "world" && parts[1] === "flags" && parts[2]) return parts[2].trim();
  }
  if (typeof delta.key === "string" && delta.key.trim().length > 0) {
    return delta.key.trim();
  }
  return "";
}

function isTrivialFailureFlagDelta(delta: unknown): boolean {
  if (!isRecord(delta)) return false;
  const namespace = namespaceForDelta(delta);
  if (namespace !== "flags") return false;
  const key = flagKeyForDelta(delta).toLowerCase();
  if (!TRIVIAL_FAILURE_FLAG_KEYS.has(key)) return false;
  if ("value" in delta) {
    return delta.value === true;
  }
  return true;
}

function compareConsequenceRisk(a: ConsequenceRiskLevel, b: ConsequenceRiskLevel): number {
  const ai = CONSEQUENCE_RISK_ORDER.indexOf(a);
  const bi = CONSEQUENCE_RISK_ORDER.indexOf(b);
  return ai - bi;
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
    const resolutionSource = isRecord(source.resolution)
      ? source
      : isRecord(turnJson.resolution)
        ? turnJson
        : source;
    return {
      turnIndex,
      deltas,
      ledgerAdds,
      tags: readTags(turn),
      isFailure: isFailureResolution(resolutionSource),
      hasBranchTransition: hasBranchTransition(source) || hasBranchTransition(turnJson),
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

function hasStyleLockInInitialState(scenarioJson: unknown, key: string): boolean {
  if (!isRecord(scenarioJson)) return false;
  const initialState = isRecord(scenarioJson.initialState) ? scenarioJson.initialState : null;
  if (!initialState) return false;
  if (isRecord(initialState.flags) && key in initialState.flags) {
    return true;
  }
  if (isRecord(initialState.world) && isRecord(initialState.world.flags) && key in initialState.world.flags) {
    return true;
  }
  return false;
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
  const styleTransitionCounts = new Map<string, number>();
  const orderedStyleKeys = [...STYLE_LOCK_KEYS].sort(compareText);
  for (const key of orderedStyleKeys) {
    const value = readStyleLockValueFromInitialState(scenarioJson, key);
    if (value !== undefined) {
      if (typeof value !== "string" || !STYLE_LOCK_ALLOWED_VALUES.has(value)) {
        errors.add("SCENARIO_STYLE_LOCK_ENUM_INVALID");
      }
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

    if (turn.isFailure) {
      const hasQuestFlagStat = turn.deltas.some((delta) => isQuestFlagStatMutation(delta));
      const hasProgression = turn.deltas.length > 0 || hasQuestFlagStat || turn.hasBranchTransition;
      if (!hasProgression) {
        errors.add("SCENARIO_DEAD_END_BRANCH");
      }

      const hasMeaningfulNamespaceMutation = turn.deltas.some((delta) =>
        MEANINGFUL_FAILURE_NAMESPACES.has(namespaceForDelta(delta)),
      );
      const hasNonTrivialFlagMutation = turn.deltas.some(
        (delta) => namespaceForDelta(delta) === "flags" && !isTrivialFailureFlagDelta(delta),
      );
      const hasMeaningfulFailureProgression =
        turn.hasBranchTransition || hasMeaningfulNamespaceMutation || hasNonTrivialFlagMutation;
      const hasOnlyTrivialFlagMutation =
        turn.deltas.length > 0 && turn.deltas.every((delta) => isTrivialFailureFlagDelta(delta));
      if (!hasMeaningfulFailureProgression && hasOnlyTrivialFlagMutation) {
        errors.add("SCENARIO_MEANINGLESS_FAILURE");
      }
    }

    const stakesOverride = readLedgerStakesRiskOverride(turn.ledgerAdds);
    if (stakesOverride) {
      const consequenceInput = {
        deltas: turn.deltas,
        ledgerAdds: turn.ledgerAdds,
        resolution: turn.isFailure ? { tier: "fail" } : undefined,
      };
      const baseRisk = classifyConsequence(consequenceInput, { ignoreLedgerStakesOverride: true }).riskLevel;
      const effectiveRisk = classifyConsequence(consequenceInput).riskLevel;
      if (compareConsequenceRisk(effectiveRisk, baseRisk) < 0) {
        errors.add("SCENARIO_STAKES_CONTRADICTION");
      }
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
          const lockFieldPresent = hasStyleLockInInitialState(scenarioJson, styleKey) || current !== undefined;
          if (current !== next) {
            const nextCount = (styleTransitionCounts.get(styleKey) ?? 0) + 1;
            styleTransitionCounts.set(styleKey, nextCount);
            if (nextCount > 1) {
              errors.add("SCENARIO_STYLE_INSTABILITY");
            }
          }

          if (lockFieldPresent && next === undefined) {
            errors.add("SCENARIO_STYLE_LOCK_TRANSITION_INVALID");
          }
          if (next !== undefined) {
            if (typeof next !== "string" || !STYLE_LOCK_ALLOWED_VALUES.has(next)) {
              errors.add("SCENARIO_STYLE_LOCK_ENUM_INVALID");
            } else {
              if (current !== undefined && current !== next) {
                errors.add("SCENARIO_STYLE_LOCK_TRANSITION_INVALID");
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
