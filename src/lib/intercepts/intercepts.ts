export type InterceptKind = "patrol" | "checkpoint";

export type Intercept = {
  id: string;
  kind: InterceptKind;
  severity: 1 | 2 | 3;
  scope: "room" | "district";
  expiresAtTurn: number;
  telegraph: string;
  tags: string[];
};

export type InterceptsState = {
  active: Intercept[];
  history: { id: string; turn: number; alert: number; at: string }[];
  seed: string; // stable per adventure
};

const LIB = [
  {
    id: "watch_patrol",
    kind: "patrol" as const,
    scope: "room" as const,
    tags: ["flashlights", "boots"] as const,
    telegraph: "Bootsteps and a sweep of flashlight beams cut across your path.",
    durationTurns: 2,
    minAlert: 1,
    maxAlert: 2,
  },
  {
    id: "ad_hoc_checkpoint",
    kind: "checkpoint" as const,
    scope: "district" as const,
    tags: ["papers", "radio"] as const,
    telegraph: "A pop-up checkpoint is forming ahead—radios crackling, IDs demanded.",
    durationTurns: 3,
    minAlert: 2,
    maxAlert: 6,
  },
] as const;

function stableHash(input: string): string {
  // FNV-1a-ish (stable across runs)
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function getAlert(state: any): number {
  const v = state?.world?.clocks?.clk_alert?.value ?? 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function getLocationId(state: any): string {
  return String(state?.world?.locationId ?? "unknown");
}

export function ensureInterceptsState(state: any, seed: string): InterceptsState {
  state.intercepts ??= { active: [], history: [], seed };
  state.intercepts.active ??= [];
  state.intercepts.history ??= [];
  state.intercepts.seed ??= seed;
  return state.intercepts as InterceptsState;
}

export function expireIntercepts(state: any, currentTurn: number) {
  const ints = ensureInterceptsState(state, String(state?.intercepts?.seed ?? "seed"));
  ints.active = ints.active.filter((i) => i.expiresAtTurn > currentTurn);
}

function pickDeterministic(args: {
  seed: string;
  turnIndex: number;
  locationId: string;
  alert: number;
  recentIds: string[];
}) {
  const { seed, turnIndex, locationId, alert, recentIds } = args;

  const candidates = LIB
    .filter((d) => alert >= d.minAlert && alert <= d.maxAlert)
    .filter((d) => !recentIds.includes(d.id));

  if (candidates.length === 0) return null;

  const key = stableHash(`${seed}:${turnIndex}:${alert}:${locationId}`);

  return candidates
    .map((c) => ({ c, h: stableHash(`${key}:${c.id}`) }))
    .sort((a, b) => a.h.localeCompare(b.h))[0]!.c;
}

/**
 * Returns `null` or a spawned intercept object.
 * Call this ONLY when alert increased.
 */
export function spawnInterceptOnAlertIncrease(args: {
  prevState: any;
  nextState: any;
  seed: string;
  turnIndex: number;
}) {
  const { prevState, nextState, seed, turnIndex } = args;

  const prevAlert = getAlert(prevState);
  const nextAlert = getAlert(nextState);
  if (nextAlert <= prevAlert) return null;

  const ints = ensureInterceptsState(nextState, seed);

  const recentIds = ints.history
    .filter((h) => turnIndex - h.turn <= 3)
    .map((h) => h.id);

  const def = pickDeterministic({
    seed: ints.seed,
    turnIndex,
    locationId: getLocationId(nextState),
    alert: nextAlert,
    recentIds,
  });

  if (!def) return null;

  const severity: 1 | 2 | 3 = nextAlert >= 4 ? 3 : nextAlert >= 2 ? 2 : 1;

  const spawned: Intercept = {
    id: def.id,
    kind: def.kind,
    severity,
    scope: def.scope,
    expiresAtTurn: (Number(nextState?.world?.time ?? turnIndex) || turnIndex) + def.durationTurns,
    telegraph: def.telegraph,
    tags: [...def.tags],
  };

  ints.active.push(spawned);
  ints.history.push({ id: spawned.id, turn: turnIndex, alert: nextAlert, at: getLocationId(nextState) });

  return spawned;
}
