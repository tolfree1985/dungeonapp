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

type ReplayEvent = { seq: number; turnJson: any };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
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

function assertNoForbiddenDeltaValues(value: unknown, path: string): void {
  if (value === undefined) {
    throw new Error(`STATE_DELTA_UNDEFINED_VALUE path=${path}`);
  }
  if (typeof value === "function") {
    throw new Error(`STATE_DELTA_FUNCTION_VALUE path=${path}`);
  }
  if (value instanceof Date) {
    throw new Error(`STATE_DELTA_DATE_VALUE path=${path}`);
  }
  if (Array.isArray(value)) {
    value.forEach((entry, idx) => assertNoForbiddenDeltaValues(entry, `${path}[${idx}]`));
    return;
  }
  if (isRecord(value)) {
    const keys = Object.keys(value).sort();
    for (const key of keys) {
      const normalizedKey = key.toLowerCase();
      if (FORBIDDEN_DELTA_KEYS.has(normalizedKey)) {
        throw new Error(`STATE_DELTA_FORBIDDEN_KEY key=${key}`);
      }
      assertNoForbiddenDeltaValues(value[key], path ? `${path}.${key}` : key);
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

  assertNoForbiddenDeltaValues(delta, "delta");
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

function parseLedgerTurnIndex(entry: unknown): number | null {
  if (!isRecord(entry)) return null;
  const candidates = [entry.turnIndex, entry.refTurnIndex, entry.turn];
  for (const raw of candidates) {
    if (typeof raw === "number" && Number.isInteger(raw)) return raw;
    if (typeof raw === "string" && /^-?\d+$/.test(raw.trim())) return Number(raw.trim());
  }
  return null;
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

export function assertLedgerConsistency(events: ReplayEvent[]): void {
  const turnIndexes = new Set<number>(events.map((event) => event.seq));
  const seenLedgerIds = new Set<string>();
  const perTurnRows: Array<{ seq: number; deltaCount: number; ledgerCount: number }> = [];

  for (const event of events) {
    const tj = event?.turnJson ?? {};
    const deltas = getReplayDeltas(event);
    const ledgerAdds = Array.isArray(tj?.ledgerAdds) ? tj.ledgerAdds : [];

    if (ledgerAdds.length > 0 && deltas.length === 0) {
      throw new Error(`LEDGER_WITHOUT_DELTA seq=${event.seq}`);
    }

    ledgerAdds.forEach((entry, idx) => {
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

function assertReplayStateInvariant(state: unknown): void {
  if (!isRecord(state)) {
    throw new Error("REPLAY_STATE_INVALID");
  }
  const keys = Object.keys(state).sort();
  for (const key of keys) {
    if (!ALLOWED_STATE_NAMESPACES.has(key)) {
      throw new Error(`REPLAY_STATE_TOP_KEY_NOT_ALLOWED key=${key}`);
    }
  }
}

/**
 * Deterministic replay of canonical event log payloads.
 *
 * NOTE: We allow an explicit "anchor" genesis event (seq=0) to omit deltas.
 * This enables fork/anchor strategies without rewriting history.
 */
export function replayStateFromTurnJson(
  events: ReplayEvent[],
  genesisState?: any
) {
  let state: any = genesisState ?? createInitialStateV1();
  assertLedgerConsistency(events);

  for (const e of events) {
    const deltas = getReplayDeltasStrict(e);
    deltas.forEach((delta) => {
      assertStateDeltaShape(delta);
      assertDeltaNamespaceAllowed(delta);
    });

    state = applyDeltas(state, deltas);
  }
  assertReplayStateInvariant(state);

  return state;
}
