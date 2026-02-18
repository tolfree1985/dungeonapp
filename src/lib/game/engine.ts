// src/lib/game/engine.ts
// ENGINE_CONTRACT_V1 (INTERCEPT SYSTEM STABLE)
// Handler marker: HANDLER_PATCH_STATE_REPAIR_2026-02-11C
//
// Turn Flow:
// route.ts → handleTurn() → runEngineTurn() → applyDeltas()
//
// Determinism Rules (STRICT):
// - Deterministic per (baseSeed + turnIndex)
// - Only RNG allowed: roll2d6(seedForTurn)
// - No Date.now(), no Math.random(), no non-seeded randomness
// - State derived only from deltas
// - No direct state mutation
// - Replay must remain valid
// - All intercept persistence is delta-driven
// - applyDeltas is pure
//
// Architectural Hardening (ENGINE_CONTRACT_LOCK_V2):
// - Engine validates deltas before return (fail-fast)
// - Engine canonicalizes delta order (stable replay diffs)
// - Returned value is ALWAYS a real iterable array + has `.deltas` and `.engineBuild`
//
// Architectural Hardening (TURN_INDEX_DRIFT_GUARD_V1):
// - Optional fail-fast drift detection if state.meta.turnIndex exists
// - No schema migrations required (no-op unless field exists)

export type TurnIndex = number;

export type EngineBuild = "ENGINE_CONTRACT_V1";

export type ReducerOp =
  | {
      op: "intercepts.upsert";
      value: {
        set?: Intercept[]; // full object(s)
        remove?: { id: string; spawnedTurn: number }[];
        historyAppend?: InterceptHistoryEvent[];
      };
    }
  // ✅ Clock operations MUST match reducer StateDelta shape:
  | { op: "clock.set"; id: string; value: number; why?: string }
  | { op: "clock.inc"; id: string; by: number; why?: string };

export type InterceptKind = "debug" | "patrol" | "threat" | "system" | string;

export type Intercept = {
  id: string;
  kind: InterceptKind;
  spawnedTurn: number;
  expiresTurn?: number;
  source?: string;
  data?: Record<string, unknown>;

  escalation?: number; // 0..n
  lastEscalatedTurn?: number;

  [k: string]: unknown;
};

export type InterceptHistoryEvent = {
  t: number; // turnIndex
  id: string;
  type: "spawn" | "expire" | "escalate" | "consequence" | "debug" | string;
  msg?: string;
  payload?: Record<string, unknown>;
};

export type EngineState = {
  // persisted shape may be either:
  //   - Intercept[]
  //   - { intercepts: Intercept[] }
  intercepts: unknown;
  clocks: Record<string, number> | unknown;
};

export type EngineInput = {

  baseSeed: string | number;
  turnIndex: TurnIndex;
  state: EngineState;
  debugFlags?: Record<string, any>;
  playerInput?: string;
  playerText?: string;
  debug?: any;
};

/**
 * Compatibility Return Type:
 * We return a REAL ARRAY (iterable) but also attach `.deltas` and `.engineBuild`
 * so object-destructuring call sites keep working without route changes.
 */
export type EngineReturn = ReducerOp[] & {
  engineBuild: EngineBuild;
  deltas: ReducerOp[];
};

/* ------------------------------------------------------------------------------------------------
 * TURN INDEX DRIFT GUARD (optional, no migration)
 * ---------------------------------------------------------------------------------------------- */

function assertTurnIndexDrift(state: unknown, expectedTurnIndex: number): void {
  // Only enforce if state already carries meta.turnIndex (no schema migration required).
  const actual = (state as any)?.meta?.turnIndex;
  if (actual == null) return;

  if (!Number.isInteger(actual)) {
    throw new Error(`TURN_INDEX_INVALID: state.meta.turnIndex must be integer, got ${String(actual)}`);
  }
  if (actual !== expectedTurnIndex) {
    throw new Error(`TURN_INDEX_DRIFT: state=${actual} expected=${expectedTurnIndex}`);
  }
}

/* ------------------------------------------------------------------------------------------------
 * ENGINE TURN
 * ---------------------------------------------------------------------------------------------- */

export function runEngineTurn(input: EngineInput): EngineReturn {
  const { turnIndex, state } = input;

  // 🔒 Drift guard (no-op unless state.meta.turnIndex exists)
  assertTurnIndexDrift(state as any, turnIndex);

  const deltas: ReducerOp[] = [];

  // Lifecycle (stable order)
  deltas.push(...maybeExpireIntercepts(state, turnIndex));
  deltas.push(...maybeApplyDebugClockOps(state, turnIndex));
  deltas.push(...maybeEscalateInterceptsDeterministic(state, turnIndex));

  // consequence layer (runs after escalation)
  deltas.push(...maybeApplyInterceptConsequences(state, turnIndex));

  deltas.push(...maybeAddDebugSpawnIntercept(state, turnIndex));

  // 🔒 Contract lock: fail-fast validate + canonical order (stable replay diffs)
  const locked = contractLockDeltas(deltas);

  // Return MUST be a real iterable array + maintain `{ deltas, engineBuild }` compatibility.
  const out = locked as EngineReturn;
  out.deltas = locked;
  out.engineBuild = "ENGINE_CONTRACT_V1";
  return out;
}

/* ------------------------------------------------------------------------------------------------
 * ENGINE_CONTRACT_LOCK_V2 (runtime fail-fast + canonical ordering)
 * ---------------------------------------------------------------------------------------------- */

function contractLockDeltas(input: ReducerOp[]): ReducerOp[] {
  // 1) fail-fast validate (shape + known ops)
  for (let i = 0; i < input.length; i++) assertValidDelta(input[i], i);

  // 2) canonical order (no semantic changes, only stable ordering)
  // Canonical order: opRank -> id (if present) -> stable original index
  const indexed = input.map((d, i) => ({ d, i }));
  indexed.sort((a, b) => {
    const ar = opRank(a.d);
    const br = opRank(b.d);
    if (ar !== br) return ar - br;

    const aid = deltaId(a.d);
    const bid = deltaId(b.d);
    if (aid !== bid) return aid < bid ? -1 : 1;

    return a.i - b.i; // stable tie-break
  });

  return indexed.map((x) => x.d);
}

function opRank(d: ReducerOp): number {
  switch (d.op) {
    case "clock.set":
      return 10;
    case "clock.inc":
      return 20;
      return 30;
    case "intercepts.upsert":
      return 40;
    default:
      // should be unreachable because assertValidDelta fail-fast
      return 999;
  }
}

function deltaId(d: ReducerOp): string {
  // provide deterministic tie-break for ops that include an id
  if (d.op === "clock.set" || d.op === "clock.inc") return String(d.id);
  return "";
}

function assertValidDelta(d: ReducerOp, index: number): void {
  const fail = (msg: string): never => {
    throw new Error(`ENGINE_DELTA_CONTRACT_VIOLATION @${index}: ${msg} :: ${stableStringify(d)}`);
  };

  if (!d || typeof d !== "object") fail("delta is not an object");
  if (typeof (d as any).op !== "string") fail("delta.op must be a string");

  switch (d.op) {
    case "clock.inc": {
      const x: any = d;
      if (typeof x.id !== "string" || x.id.length === 0) fail("clock.inc.id must be non-empty string");
      if (!Number.isInteger(x.by)) fail("clock.inc.by must be integer");
      if ("value" in x) fail("clock.inc must not include value");
      break;
    }
    case "clock.set": {
      const x: any = d;
      if (typeof x.id !== "string" || x.id.length === 0) fail("clock.set.id must be non-empty string");
      if (!Number.isInteger(x.value)) fail("clock.set.value must be integer");
      if ("by" in x) fail("clock.set must not include by");
      break;
    }
    case "intercepts.upsert": {
      const x: any = d;
      if (!x.value || typeof x.value !== "object") fail("intercepts.upsert.value must be object");
      const v = x.value;

      if (v.set != null) {
        if (!Array.isArray(v.set)) fail("intercepts.upsert.value.set must be array when present");
        for (const itc of v.set) {
          if (!itc || typeof itc !== "object") fail("intercepts.upsert.value.set contains non-object");
          if (typeof (itc as any).id !== "string" || !(itc as any).id)
            fail("intercepts.upsert.value.set[].id must be string");
          if (!Number.isInteger((itc as any).spawnedTurn))
            fail("intercepts.upsert.value.set[].spawnedTurn must be integer");
        }
      }

      if (v.remove != null) {
        if (!Array.isArray(v.remove)) fail("intercepts.upsert.value.remove must be array when present");
        for (const r of v.remove) {
          if (!r || typeof r !== "object") fail("intercepts.upsert.value.remove contains non-object");
          if (typeof (r as any).id !== "string" || !(r as any).id)
            fail("intercepts.upsert.value.remove[].id must be string");
          if (!Number.isInteger((r as any).spawnedTurn))
            fail("intercepts.upsert.value.remove[].spawnedTurn must be integer");
        }
      }

      if (v.historyAppend != null) {
        if (!Array.isArray(v.historyAppend))
          fail("intercepts.upsert.value.historyAppend must be array when present");
        for (const e of v.historyAppend) {
          if (!e || typeof e !== "object") fail("intercepts.upsert.value.historyAppend contains non-object");
          if (!Number.isInteger((e as any).t)) fail("historyAppend[].t must be integer");
          if (typeof (e as any).id !== "string") fail("historyAppend[].id must be string");
          if (typeof (e as any).type !== "string") fail("historyAppend[].type must be string");
        }
      }

      break;
    }
      const x: any = d;
      break;
    default:
      fail(`unknown op "${(d as any).op}"`);
  }
}

// Deterministic stringify for error messages (no Date, no randomness)
function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}
function sortKeys(v: any): any {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    const out: any = {};
    for (const k of Object.keys(v).sort()) out[k] = sortKeys(v[k]);
    return out;
  }
  return v;
}

/* ------------------------------------------------------------------------------------------------
 * Deterministic RNG helpers
 * ---------------------------------------------------------------------------------------------- */

export function seedForTurn(baseSeed: string, turnIndex: number): string {
  return `${baseSeed}::turn::${turnIndex}`;
}

// Simple deterministic hash -> uint32 (FNV-1a-ish)
function hash32(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

// Only RNG allowed (per contract): roll2d6(seedForTurn)
export function roll2d6(seed: string): { d1: number; d2: number; total: number } {
  const h1 = hash32(`${seed}::d1`);
  const h2 = hash32(`${seed}::d2`);
  const d1 = (h1 % 6) + 1;
  const d2 = (h2 % 6) + 1;
  return { d1, d2, total: d1 + d2 };
}

/* ------------------------------------------------------------------------------------------------
 * Utilities (pure)
 * ---------------------------------------------------------------------------------------------- */

function interceptSortKey(i: Intercept): string {
  // Ordering is deterministic: (spawnedTurn, id)
  return `${String(i.spawnedTurn).padStart(10, "0")}::${i.id}`;
}

function getInterceptMap(intercepts: Intercept[]): Map<string, Intercept> {
  const m = new Map<string, Intercept>();
  for (const itc of intercepts) m.set(itc.id, itc);
  return m;
}

function readInterceptList(state: EngineState): Intercept[] {
  const raw: any = (state as any)?.intercepts;

  // Case A: intercepts stored directly as array
  if (Array.isArray(raw)) return raw as Intercept[];

  // Case B: intercepts stored as wrapper object { intercepts: [...] }
  if (raw && Array.isArray(raw.intercepts)) return raw.intercepts as Intercept[];

  return [];
}

function readClocks(state: EngineState): Record<string, number> {
  const raw: any = (state as any)?.clocks;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, number>;
  return {};
}

function nowClock(state: EngineState, key: string): number {
  const clocks = readClocks(state);
  return clocks[key] ?? 0;
}

/* ------------------------------------------------------------------------------------------------
 * Stable lifecycle pieces (already verified)
 * ---------------------------------------------------------------------------------------------- */

export function maybeExpireIntercepts(state: EngineState, turnIndex: number): ReducerOp[] {
  const intercepts = readInterceptList(state);

  const toExpire = intercepts
    .filter((i) => typeof i.expiresTurn === "number" && (i.expiresTurn as number) <= turnIndex)
    .slice()
    .sort((a, b) => interceptSortKey(a).localeCompare(interceptSortKey(b)));

  if (toExpire.length === 0) return [];

  const remove = toExpire.map((i) => ({ id: i.id, spawnedTurn: i.spawnedTurn }));

  const historyAppend: InterceptHistoryEvent[] = toExpire.map((i) => ({
    t: turnIndex,
    id: i.id,
    type: "expire",
    msg: `Intercept expired`,
    payload: { snapshot: { ...i } },
  }));

  return [{ op: "intercepts.upsert", value: { remove, historyAppend } }];
}

export function maybeApplyDebugClockOps(state: EngineState, turnIndex: number): ReducerOp[] {
  // placeholder debug behavior; deterministic
  if (turnIndex % 5 !== 0) return [];

  return [
    // ✅ aligned to reducer: { id, by }
    { op: "clock.inc", id: "clk_noise", by: 1, why: "debug tick (turnIndex%5==0)" },
    {
      op: "intercepts.upsert",
      value: {
        historyAppend: [
          { t: turnIndex, id: "__system__", type: "debug", msg: "Debug clock tick: clk_noise +1" },
        ],
      },
    },
  ];
}

export function maybeEscalateInterceptsDeterministic(state: EngineState, turnIndex: number): ReducerOp[] {
  const raw = (state as any)?.intercepts;
  const intercepts: Intercept[] = Array.isArray(raw)
    ? (raw as Intercept[])
    : Array.isArray(raw?.intercepts)
      ? (raw.intercepts as Intercept[])
      : [];

  if (intercepts.length === 0) return [];

  const set: Intercept[] = [];
  const historyAppend: InterceptHistoryEvent[] = [];

  for (const itc of intercepts) {
    if (!itc || typeof itc !== "object") continue;
    if ((itc as any).deleted === true) continue;
    if (Number.isInteger(itc.expiresTurn) && turnIndex >= (itc.expiresTurn as number)) continue;

    const interval =
      Number.isInteger((itc as any).escalationInterval)
        ? (itc as any).escalationInterval
        : Number.isInteger((itc as any)?.data?.escalationInterval)
          ? (itc as any).data.escalationInterval
          : null;

    if (!Number.isInteger(interval) || interval <= 0) continue;

    const last = Number.isInteger(itc.lastEscalatedTurn) ? (itc.lastEscalatedTurn as number) : itc.spawnedTurn;
    if (!Number.isInteger(last)) continue;
    if (turnIndex - last < interval) continue;

    const prevEsc = Number.isInteger(itc.escalation) ? (itc.escalation as number) : 0;
    const maxEsc =
      Number.isInteger((itc as any).maxEscalation)
        ? (itc as any).maxEscalation
        : Number.isInteger((itc as any)?.data?.maxEscalation)
          ? (itc as any).data.maxEscalation
          : null;

    const nextEsc = prevEsc + 1;
    if (Number.isInteger(maxEsc) && nextEsc > (maxEsc as number)) continue;

    set.push({
      ...itc,
      escalation: nextEsc,
      lastEscalatedTurn: turnIndex,
    });

    historyAppend.push({
      t: turnIndex,
      id: String(itc.id),
      type: "escalate",
      msg: `escalation ${nextEsc} @t=${turnIndex} (interval=${interval})`,
      payload: {
        prevEscalation: prevEsc,
        nextEscalation: nextEsc,
        interval,
        lastEscalatedTurn: last,
        ...(Number.isInteger(maxEsc) ? { maxEscalation: maxEsc } : null),
      } as any,
    });
  }

  if (set.length === 0 && historyAppend.length === 0) return [];

  set.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  historyAppend.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return [{
    op: "intercepts.upsert",
    value: {
      ...(set.length ? { set } : null),
      ...(historyAppend.length ? { historyAppend } : null),
    } as any,
  }];
}


export function maybeAddDebugSpawnIntercept(state: EngineState, turnIndex: number): ReducerOp[] {
  const intercepts = readInterceptList(state);

  const id = `dbg_patrol_${turnIndex}`;
  if (getInterceptMap(intercepts).has(id)) return [];

  const itc: Intercept = {
    id,
    kind: "debug",
    spawnedTurn: turnIndex,
    expiresTurn: turnIndex + 3,
    source: "debug",
    data: { note: "debug patrol spawn" },
    escalation: 0,
    lastEscalatedTurn: undefined,
  };

  return [
    {
      op: "intercepts.upsert",
      value: {
        set: [itc],
        historyAppend: [{ t: turnIndex, id, type: "spawn", msg: "Debug intercept spawned" }],
      },
    },
  ];
}

/* ------------------------------------------------------------------------------------------------
 * Intercept Consequence Layer (deterministic, deltas-only)
 * ---------------------------------------------------------------------------------------------- */

export function maybeApplyInterceptConsequences(state: EngineState, turnIndex: number): ReducerOp[] {
  const intercepts = readInterceptList(state);
  if (intercepts.length === 0) return [];

  const active = intercepts
    .filter((i) => (i.expiresTurn == null ? true : (i.expiresTurn as number) > turnIndex))
    .slice()
    .sort((a, b) => interceptSortKey(a).localeCompare(interceptSortKey(b)));

  // Only apply consequences on the SAME turn the intercept escalated
  const justEscalated = active.filter((i) => i.lastEscalatedTurn === turnIndex);
  if (justEscalated.length === 0) return [];

  let incNoiseBy = 0;
  let setPatrolActive = false;

  const historyAppend: InterceptHistoryEvent[] = [];
  const existingIds = getInterceptMap(intercepts);
  const spawnSet: Intercept[] = [];

  for (const itc of justEscalated) {
    const esc = (itc.escalation as number | undefined) ?? 0;

    if (esc >= 1) {
      incNoiseBy += 1;
      historyAppend.push({
        t: turnIndex,
        id: itc.id,
        type: "consequence",
        msg: "Escalation consequence: clk_noise +1",
        payload: { escalation: esc, effect: { clockInc: { id: "clk_noise", by: 1 } } },
      });
    }

    if (esc >= 2) {
      setPatrolActive = true;
      historyAppend.push({
        t: turnIndex,
        id: itc.id,
        type: "consequence",
        msg: "Escalation consequence: flag_patrol_active = 1",
        payload: { escalation: esc, effect: { clockSet: { id: "flag_patrol_active", value: 1 } } },
      });
    }

    if (esc >= 3) {
      const childId = `${itc.id}__sec_${turnIndex}`;

      if (!existingIds.has(childId)) {
        spawnSet.push({
          id: childId,
          kind: "threat",
          spawnedTurn: turnIndex,
          expiresTurn: turnIndex + 2,
          source: "consequence",
          data: { parentId: itc.id, reason: "escalation>=3" },
          escalation: 0,
        });

        historyAppend.push({
          t: turnIndex,
          id: itc.id,
          type: "consequence",
          msg: `Escalation consequence: spawned secondary intercept ${childId}`,
          payload: { escalation: esc, effect: { spawnInterceptId: childId } },
        });
      } else {
        historyAppend.push({
          t: turnIndex,
          id: itc.id,
          type: "consequence",
          msg: `Escalation consequence: secondary intercept already exists (${childId})`,
          payload: { escalation: esc, effect: { spawnInterceptId: childId, skipped: true } },
        });
      }
    }
  }

  const deltas: ReducerOp[] = [];

  // ✅ aligned to reducer: { id, by/value }
  if (incNoiseBy !== 0) {
    deltas.push({
      op: "clock.inc",
      id: "clk_noise",
      by: incNoiseBy,
      why: "intercept consequence (escalation>=1)",
    });
  }

  if (setPatrolActive) {
    deltas.push({
      op: "clock.set",
      id: "flag_patrol_active",
      value: 1,
      why: "intercept consequence (escalation>=2)",
    });
  }

  if (spawnSet.length > 0 || historyAppend.length > 0) {
    const sortedSpawn = spawnSet.slice().sort((a, b) => a.id.localeCompare(b.id));
    deltas.push({
      op: "intercepts.upsert",
      value: {
        set: sortedSpawn.length ? sortedSpawn : undefined,
        historyAppend: historyAppend.length ? historyAppend : undefined,
      },
    });
  }

  return deltas;
}
