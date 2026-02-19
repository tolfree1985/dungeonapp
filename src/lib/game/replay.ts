import { createInitialStateV1 } from "./bootstrap";
import { applyDeltas } from "./state";

const FORBIDDEN_DELTA_KEYS = new Set([
  "seed",
  "randomseed",
  "rngseed",
  "timestamp",
  "createdat",
  "updatedat",
]);

export const ALLOWED_STATE_NAMESPACES = new Set([
  "stats",
  "inventory",
  "relationships",
  "quests",
  "flags",
]);

const STYLE_LOCK_KEYS = ["toneLock", "genreLock", "pacingLock"] as const;
const STYLE_LOCK_ALLOWED_VALUES = new Set(["none", "unlocked", "locked"]);

const ALLOWED_REPLAY_TOP_LEVEL_KEYS = new Set([
  "stateVersion",
  "world",
  "inventory",
  "map",
  "npcs",
  "intercepts",
  "stats",
  "relationships",
  "quests",
  "flags",
]);

const LEDGER_FORBIDDEN_PATTERNS = [
  /\bdate\.now\b/i,
  /\bmath\.random\b/i,
  /\brandom\b/i,
  /\bseed\b/i,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
  /\b\d{4}-\d{2}-\d{2}t\d{2}:\d{2}:\d{2}(?:\.\d+)?z?\b/i,
  /\b\d{13}\b/,
  /\b0\.\d{6,}\b/,
];

type ReplayEvent = { seq: number; turnJson: any };

export type ReplayGuardName =
  | "TURN_MONOTONICITY"
  | "LEDGER_CONSISTENCY"
  | "FAIL_FORWARD_INVARIANT"
  | "DELTA_SHAPE"
  | "DELTA_NAMESPACE"
  | "DELTA_ORDER"
  | "DELTA_APPLY_IDEMPOTENCY"
  | "STYLE_LOCK_INVARIANT"
  | "REPLAY_STATE_INVARIANT";

export const REPLAY_GUARD_ORDER: readonly ReplayGuardName[] = [
  "TURN_MONOTONICITY",
  "LEDGER_CONSISTENCY",
  "FAIL_FORWARD_INVARIANT",
  "DELTA_SHAPE",
  "DELTA_NAMESPACE",
  "DELTA_ORDER",
  "DELTA_APPLY_IDEMPOTENCY",
  "STYLE_LOCK_INVARIANT",
  "REPLAY_STATE_INVARIANT",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function stableNormalizeValue(value: unknown, path: string, seen: WeakSet<object>): unknown {
  if (value === undefined) {
    throw new Error(`STATE_DELTA_UNDEFINED_VALUE path=${path}`);
  }
  if (typeof value === "function") {
    throw new Error(`STATE_DELTA_FUNCTION_VALUE path=${path}`);
  }
  if (value instanceof Date) {
    throw new Error(`STATE_DELTA_DATE_VALUE path=${path}`);
  }
  if (typeof value === "bigint" || typeof value === "symbol") {
    throw new Error(`DELTA_VALUE_INVALID path=${path}`);
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error(`DELTA_VALUE_INVALID path=${path}`);
  }
  if (Array.isArray(value)) {
    return value.map((entry, idx) => stableNormalizeValue(entry, `${path}[${idx}]`, seen));
  }
  if (isRecord(value)) {
    if (seen.has(value)) {
      throw new Error(`DELTA_VALUE_INVALID path=${path}`);
    }
    seen.add(value);

    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      throw new Error(`DELTA_VALUE_INVALID path=${path}`);
    }

    const out: Record<string, unknown> = {};
    const keys = Object.keys(value).sort(compareText);
    for (const key of keys) {
      const normalizedKey = key.toLowerCase();
      if (FORBIDDEN_DELTA_KEYS.has(normalizedKey)) {
        throw new Error(`STATE_DELTA_FORBIDDEN_KEY key=${key}`);
      }
      out[key] = stableNormalizeValue(value[key], path ? `${path}.${key}` : key, seen);
    }
    return out;
  }
  return value;
}

function stableStringifyDeterministic(value: unknown, path: string): string {
  const normalized = stableNormalizeValue(value, path, new WeakSet());
  return JSON.stringify(normalized);
}

function normalizeDeltaPath(path: unknown): string | null {
  if (typeof path === "string") {
    const text = path.trim();
    return text.length > 0 ? text : null;
  }
  if (Array.isArray(path)) {
    const parts = path.map((part) => String(part).trim()).filter((part) => part.length > 0);
    return parts.length > 0 ? parts.join(".") : null;
  }
  return null;
}

function explicitDeltaPath(delta: unknown): string | null {
  if (!isRecord(delta)) return null;
  if (!("path" in delta)) return null;
  const normalized = normalizeDeltaPath(delta.path);
  if (!normalized) {
    throw new Error("STATE_DELTA_PATH_INVALID");
  }
  return normalized;
}

function assertStatsIntegerValues(value: unknown, path: string): void {
  if (typeof value === "number") {
    if (!Number.isInteger(value)) {
      throw new Error(`DELTA_VALUE_INVALID path=${path}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, idx) => assertStatsIntegerValues(entry, `${path}[${idx}]`));
    return;
  }
  if (isRecord(value)) {
    const keys = Object.keys(value).sort(compareText);
    for (const key of keys) {
      assertStatsIntegerValues(value[key], path ? `${path}.${key}` : key);
    }
  }
}

export function assertStateDeltaShape(delta: unknown): void {
  if (!isRecord(delta)) {
    throw new Error("STATE_DELTA_INVALID");
  }

  const explicitPath = explicitDeltaPath(delta);
  const op = typeof delta.op === "string" ? delta.op.trim() : "";
  const fallbackPath = op.length > 0 ? op : null;
  const path = explicitPath ?? fallbackPath;

  if (!path) {
    throw new Error("STATE_DELTA_PATH_INVALID");
  }

  stableStringifyDeterministic(delta, "delta");
  if (path.startsWith("stats.")) {
    assertStatsIntegerValues(delta, "delta");
  }
}

function deltaOrderKey(delta: unknown): string {
  const explicitPath = explicitDeltaPath(delta);
  if (explicitPath) return explicitPath;
  if (isRecord(delta) && typeof delta.op === "string" && delta.op.trim().length > 0) {
    return delta.op.trim();
  }
  return "";
}

function assertDeltaOrderIsSorted(deltas: unknown[], seq: number): unknown[] {
  const sorted = [...deltas].sort((a, b) => compareText(deltaOrderKey(a), deltaOrderKey(b)));
  for (let i = 0; i < deltas.length; i++) {
    if (deltaOrderKey(deltas[i]) !== deltaOrderKey(sorted[i])) {
      throw new Error(`DELTA_ORDER_NOT_SORTED seq=${seq}`);
    }
  }
  return sorted;
}

function assertDeltaNamespaceAllowed(delta: unknown): void {
  const path = explicitDeltaPath(delta);
  if (!path) return;
  const cleaned = path.startsWith("/") ? path.slice(1) : path;
  const namespace = cleaned.split(/[./[\]]+/).filter(Boolean)[0] ?? "";
  if (!namespace || !ALLOWED_STATE_NAMESPACES.has(namespace)) {
    throw new Error(`DELTA_NAMESPACE_NOT_ALLOWED namespace=${namespace || "(none)"}`);
  }
}

function assertLedgerTextDeterminism(value: unknown): void {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    for (const pattern of LEDGER_FORBIDDEN_PATTERNS) {
      if (pattern.test(normalized)) {
        throw new Error("LEDGER_TEXT_NON_DETERMINISTIC");
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => assertLedgerTextDeterminism(entry));
    return;
  }
  if (isRecord(value)) {
    const keys = Object.keys(value).sort(compareText);
    for (const key of keys) {
      if (FORBIDDEN_DELTA_KEYS.has(key.toLowerCase())) {
        throw new Error("LEDGER_TEXT_NON_DETERMINISTIC");
      }
      assertLedgerTextDeterminism(value[key]);
    }
  }
}

function parseLedgerTurnIndex(entry: unknown): number | null {
  if (!isRecord(entry)) return null;
  const candidates = [entry.turnIndex, entry.refTurnIndex, entry.turn];
  for (const raw of candidates) {
    if (typeof raw === "number" && Number.isInteger(raw)) return raw;
    if (typeof raw === "string" && /^-?\d+$/.test(raw.trim())) return Number(raw.trim());
  }
  return null;
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().toLowerCase();
  return text.length > 0 ? text : null;
}

function readsFailureBand(turnJson: unknown): boolean {
  if (!isRecord(turnJson)) return false;

  const resolution = isRecord(turnJson.resolution) ? turnJson.resolution : null;
  const candidates = [
    resolution?.tier,
    resolution?.outcome,
    resolution?.band,
    turnJson.outcome,
    turnJson.tier,
    turnJson.band,
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

function hasComplicationLedgerTag(entry: unknown): boolean {
  if (!isRecord(entry)) return false;
  if (entry.complication === true) return true;
  const candidates = [entry.kind, entry.tag, entry.type, entry.message, entry.because];
  for (const candidate of candidates) {
    const normalized = normalizeText(candidate);
    if (!normalized) continue;
    if (normalized === "complication" || normalized.includes("complication")) {
      return true;
    }
  }
  return false;
}

function isQuestFlagStatMutation(delta: unknown): boolean {
  if (isRecord(delta)) {
    const path = normalizeDeltaPath(delta.path);
    if (!path) {
      const opNoPath = normalizeText(delta.op);
      if (!opNoPath) return false;
      return opNoPath.startsWith("quest.") || opNoPath.startsWith("flag.") || opNoPath.startsWith("stats.");
    }
    const cleaned = path.startsWith("/") ? path.slice(1) : path;
    const namespace = cleaned.split(/[./[\]]+/).filter(Boolean)[0] ?? "";
    if (namespace === "quests" || namespace === "flags" || namespace === "stats") {
      return true;
    }
  }
  if (!isRecord(delta)) return false;
  const op = normalizeText(delta.op);
  if (!op) return false;
  return op.startsWith("quest.") || op.startsWith("flag.") || op.startsWith("stats.");
}

function getReplayDeltas(event: ReplayEvent): unknown[] {
  const tj = event?.turnJson ?? {};
  if (event.seq === 0 && !Array.isArray(tj?.deltas)) {
    const kind = typeof tj?.kind === "string" ? tj.kind : "";
    if (kind === "FORK_FROM_CHAIN" || kind === "ANCHOR" || kind === "GENESIS") {
      return [];
    }
  }
  return Array.isArray(tj?.deltas) ? tj.deltas : [];
}

function getReplayDeltasStrict(event: ReplayEvent): unknown[] {
  const tj = event?.turnJson ?? {};
  if (event.seq === 0 && !Array.isArray(tj?.deltas)) {
    const kind = typeof tj?.kind === "string" ? tj.kind : "";
    if (kind === "FORK_FROM_CHAIN" || kind === "ANCHOR" || kind === "GENESIS") {
      return [];
    }
  }
  if (!Array.isArray(tj?.deltas)) {
    throw new Error(`Bad event payload: seq=${event.seq} missing turnJson.deltas[]`);
  }
  return tj.deltas;
}

function hasSystemNoLedgerTag(turnJson: unknown): boolean {
  if (!isRecord(turnJson)) return false;
  const tagsCandidates = [
    turnJson.tags,
    isRecord(turnJson.meta) ? turnJson.meta.tags : undefined,
    turnJson.turnTags,
  ];
  for (const candidate of tagsCandidates) {
    if (!Array.isArray(candidate)) continue;
    for (const entry of candidate) {
      if (typeof entry === "string" && entry.trim() === "system/no-ledger") {
        return true;
      }
    }
  }
  return typeof turnJson.tag === "string" && turnJson.tag.trim() === "system/no-ledger";
}

export function assertLedgerConsistency(events: ReplayEvent[]): void {
  const turnIndexes = new Set<number>(events.map((event) => event.seq));
  const seenLedgerIds = new Set<string>();
  const perTurnRows: Array<{ seq: number; deltaCount: number; ledgerCount: number }> = [];

  for (const event of events) {
    const tj = event?.turnJson ?? {};
    const deltas = getReplayDeltas(event);
    const ledgerAdds = Array.isArray(tj?.ledgerAdds) ? tj.ledgerAdds : [];

    const noLedgerTagged = hasSystemNoLedgerTag(tj);
    if (deltas.length > 0 && ledgerAdds.length === 0 && !noLedgerTagged) {
      throw new Error(`LEDGER_DELTA_COUPLING_VIOLATION seq=${event.seq} reason=delta_without_ledger`);
    }
    if (ledgerAdds.length > 0 && deltas.length === 0) {
      throw new Error(`LEDGER_DELTA_COUPLING_VIOLATION seq=${event.seq} reason=ledger_without_delta`);
    }

    ledgerAdds.forEach((entry, idx) => {
      assertLedgerTextDeterminism(entry);
      const refTurnIndex = parseLedgerTurnIndex(entry);
      if (refTurnIndex != null && !turnIndexes.has(refTurnIndex)) {
        throw new Error(`LEDGER_REFERENCE_INVALID seq=${event.seq} idx=${idx} turnIndex=${refTurnIndex}`);
      }

      if (isRecord(entry) && typeof entry.id === "string" && entry.id.trim().length > 0) {
        const id = entry.id.trim();
        if (seenLedgerIds.has(id)) {
          throw new Error(`LEDGER_DUPLICATE_ID id=${id}`);
        }
        seenLedgerIds.add(id);
      }
    });

    perTurnRows.push({
      seq: event.seq,
      deltaCount: deltas.length,
      ledgerCount: ledgerAdds.length,
    });
  }

  const totalLedgerFromRows = perTurnRows.reduce((sum, row) => sum + row.ledgerCount, 0);
  const totalLedgerFromEvents = events.reduce(
    (sum, event) => sum + (Array.isArray(event?.turnJson?.ledgerAdds) ? event.turnJson.ledgerAdds.length : 0),
    0,
  );
  if (totalLedgerFromRows !== totalLedgerFromEvents) {
    throw new Error("LEDGER_TELEMETRY_MISMATCH");
  }
}

export function assertFailForwardInvariant(events: ReplayEvent[]): void {
  for (const event of events) {
    const turnJson = isRecord(event.turnJson) ? event.turnJson : {};
    if (!readsFailureBand(turnJson)) {
      continue;
    }
    const deltas = getReplayDeltas(event);
    const ledgerAdds = Array.isArray(turnJson.ledgerAdds) ? turnJson.ledgerAdds : [];
    const hasStateDelta = deltas.length > 0;
    const hasQuestFlagStat = deltas.some((delta) => isQuestFlagStatMutation(delta));
    const hasComplicationLedger = ledgerAdds.some((entry) => hasComplicationLedgerTag(entry));
    if (!hasStateDelta && !hasQuestFlagStat && !hasComplicationLedger) {
      throw new Error(`FAIL_FORWARD_VIOLATION seq=${event.seq}`);
    }
  }
}

export function assertTurnMonotonicity(events: ReplayEvent[]): void {
  let prev: number | null = null;
  for (const event of events) {
    if (!Number.isInteger(event.seq)) {
      throw new Error("TURN_INDEX_NOT_INTEGER");
    }
    if (event.seq < 0) {
      throw new Error("TURN_INDEX_NEGATIVE");
    }
    if (prev != null && event.seq === 0) {
      throw new Error("TURN_INDEX_ZERO_REGRESSION");
    }
    if (prev != null && event.seq <= prev) {
      throw new Error("TURN_INDEX_NOT_STRICTLY_INCREASING");
    }
    prev = event.seq;
  }
}

function assertReplayStateInvariant(state: unknown): void {
  if (!isRecord(state)) {
    throw new Error("REPLAY_STATE_INVALID");
  }
  const keys = Object.keys(state).sort();
  for (const key of keys) {
    if (!ALLOWED_REPLAY_TOP_LEVEL_KEYS.has(key)) {
      throw new Error(`REPLAY_STATE_TOP_KEY_NOT_ALLOWED key=${key}`);
    }
  }
}

function readStyleLockFromState(state: unknown, key: (typeof STYLE_LOCK_KEYS)[number]): unknown {
  if (!isRecord(state)) return undefined;
  if (isRecord(state.flags) && key in state.flags) {
    return state.flags[key];
  }
  if (isRecord(state.world) && isRecord(state.world.flags) && key in state.world.flags) {
    return state.world.flags[key];
  }
  return undefined;
}

function assertStyleLockInvariant(prevState: unknown, nextState: unknown, seq: number): boolean {
  let styleLockSeen = false;
  for (const key of STYLE_LOCK_KEYS) {
    const prevValue = readStyleLockFromState(prevState, key);
    const nextValue = readStyleLockFromState(nextState, key);
    if (prevValue !== undefined || nextValue !== undefined) {
      styleLockSeen = true;
    }

    if (prevValue !== undefined && nextValue === undefined) {
      throw new Error(`STYLE_LOCK_VIOLATION seq=${seq} key=${key} reason=deleted`);
    }

    if (prevValue !== undefined) {
      if (typeof prevValue !== "string" || !STYLE_LOCK_ALLOWED_VALUES.has(prevValue)) {
        throw new Error(`STYLE_LOCK_VIOLATION seq=${seq} key=${key} reason=invalid_previous_value`);
      }
    }
    if (nextValue !== undefined) {
      if (typeof nextValue !== "string" || !STYLE_LOCK_ALLOWED_VALUES.has(nextValue)) {
        throw new Error(`STYLE_LOCK_VIOLATION seq=${seq} key=${key} reason=invalid_next_value`);
      }
    }

    if (prevValue === "locked" && nextValue !== undefined && nextValue !== "locked") {
      throw new Error(`STYLE_LOCK_VIOLATION seq=${seq} key=${key} reason=locked_transition`);
    }
  }
  return styleLockSeen;
}

export function assertDeltaApplyIdempotency(
  state: unknown,
  deltas: unknown[],
  applyFn: (base: any, inputDeltas: unknown[]) => unknown = (base, inputDeltas) => applyDeltas(base, inputDeltas as any),
): void {
  const stateA = applyFn(structuredClone(state), deltas);
  const stateB = applyFn(structuredClone(state), deltas);
  const hashA = stableStringifyDeterministic(stateA, "idempotency.a");
  const hashB = stableStringifyDeterministic(stateB, "idempotency.b");
  if (hashA !== hashB) {
    throw new Error("DELTA_APPLY_NON_IDEMPOTENT");
  }
}

export type ReplayWithGuardSummary = {
  state: any;
  guardSummary: readonly ReplayGuardName[];
  styleLockPresent: boolean;
  failForwardCheck: "PASS" | "FAIL";
};

/**
 * Deterministic replay of canonical event log payloads.
 *
 * NOTE: We allow an explicit "anchor" genesis event (seq=0) to omit deltas.
 * This enables fork/anchor strategies without rewriting history.
 */
function replayStateFromTurnJsonInternal(
  events: ReplayEvent[],
  genesisState: any,
  withGuardSummary: boolean,
): any | ReplayWithGuardSummary {
  const executedGuards = new Set<ReplayGuardName>();
  const mark = (name: ReplayGuardName) => executedGuards.add(name);
  let state: any = genesisState ?? createInitialStateV1();
  let styleLockPresent = false;

  assertTurnMonotonicity(events);
  mark("TURN_MONOTONICITY");
  assertLedgerConsistency(events);
  mark("LEDGER_CONSISTENCY");
  assertFailForwardInvariant(events);
  mark("FAIL_FORWARD_INVARIANT");

  for (const e of events) {
    const rawDeltas = getReplayDeltasStrict(e);
    rawDeltas.forEach((delta) => {
      assertStateDeltaShape(delta);
      assertDeltaNamespaceAllowed(delta);
    });
    mark("DELTA_SHAPE");
    mark("DELTA_NAMESPACE");
    const deltas = assertDeltaOrderIsSorted(rawDeltas, e.seq);
    mark("DELTA_ORDER");

    assertDeltaApplyIdempotency(state, deltas);
    mark("DELTA_APPLY_IDEMPOTENCY");

    const nextState = applyDeltas(state, deltas as any);
    styleLockPresent = assertStyleLockInvariant(state, nextState, e.seq) || styleLockPresent;
    mark("STYLE_LOCK_INVARIANT");
    state = nextState;
  }
  assertReplayStateInvariant(state);
  mark("REPLAY_STATE_INVARIANT");

  if (withGuardSummary) {
    return {
      state,
      guardSummary: REPLAY_GUARD_ORDER.filter((name) => executedGuards.has(name)),
      styleLockPresent,
      failForwardCheck: "PASS",
    };
  }

  return state;
}

export function replayStateFromTurnJson(
  events: ReplayEvent[],
  genesisState?: any,
) {
  return replayStateFromTurnJsonInternal(events, genesisState, false) as any;
}

export function replayStateFromTurnJsonWithGuardSummary(
  events: ReplayEvent[],
  genesisState?: any,
): ReplayWithGuardSummary {
  return replayStateFromTurnJsonInternal(events, genesisState, true) as ReplayWithGuardSummary;
}
