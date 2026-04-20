import { DEFAULT_ALERT_CLOCK_ID, DEFAULT_NOISE_CLOCK_ID } from "@/lib/game/bootstrap";
import type { IntentMode } from "@/lib/watchfulness-action-flags";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

export type FireStatus = "none" | "oiled" | "burning" | "burned_out";

export type FireState = {
  targetKey: string | null;
  status: FireStatus;
  createdTurnIndex: number | null;
  ignitionTurnIndex: number | null;
  intensity: 0 | 1 | 2 | 3;
  fuel: number;
};

export type FireHazardTurnResult = {
  fireState: FireState;
  stateDeltas: Array<Record<string, unknown>>;
  ledgerAdds: Array<Record<string, unknown>>;
};

export const DEFAULT_FIRE_TARGET_KEY = "surface";

export function createInitialFireState(): FireState {
  return {
    targetKey: null,
    status: "none",
    createdTurnIndex: null,
    ignitionTurnIndex: null,
    intensity: 0,
    fuel: 0,
  };
}

function toTurnIndex(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getStateTurnIndex(state: Record<string, unknown>): number | null {
  const stats = isRecord(state.stats) ? state.stats : null;
  const latestTurnIndex = toTurnIndex(state.latestTurnIndex);
  const statsTurns = toTurnIndex(stats?.turns);
  return latestTurnIndex ?? statsTurns;
}

function readWorldFlags(state: Record<string, unknown>): Record<string, boolean> {
  const world = isRecord(state.world) ? state.world : null;
  const flags = isRecord(world?.flags) ? world?.flags : null;
  const fallbackFlags = isRecord(state.flags) ? state.flags : null;
  const combined = {
    ...(fallbackFlags ?? {}),
    ...(flags ?? {}),
  };
  const normalized: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(combined)) {
    normalized[key.trim().toLowerCase()] = Boolean(value);
  }
  return normalized;
}

function normalizeFireStatus(value: unknown): FireStatus {
  return value === "oiled" || value === "burning" || value === "burned_out" ? value : "none";
}

function normalizeIntensity(value: unknown): 0 | 1 | 2 | 3 {
  if (value === 1 || value === 2 || value === 3) return value;
  return 0;
}

function normalizeFuel(value: unknown, status: FireStatus, intensity: 0 | 1 | 2 | 3): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  if (status === "burning") {
    return Math.max(1, 4 - intensity);
  }
  if (status === "oiled") {
    return 3;
  }
  return 0;
}

function normalizeFireState(value: unknown): FireState | null {
  if (!isRecord(value)) return null;
  return {
    targetKey:
      typeof value.targetKey === "string" && value.targetKey.trim()
        ? value.targetKey.trim()
        : null,
    status: normalizeFireStatus(value.status),
    createdTurnIndex: toTurnIndex(value.createdTurnIndex),
    ignitionTurnIndex: toTurnIndex(value.ignitionTurnIndex),
    intensity: normalizeIntensity(value.intensity),
    fuel: normalizeFuel(value.fuel, normalizeFireStatus(value.status), normalizeIntensity(value.intensity)),
  };
}

export function readFireState(state: Record<string, unknown>): FireState {
  const hazards = isRecord(state.environmentHazards) ? state.environmentHazards : null;
  const explicit = normalizeFireState(hazards?.fire);
  if (explicit) return explicit;

  const flags = readWorldFlags(state);
  const createdTurnIndex = getStateTurnIndex(state);
  return createInitialFireState();
}

export function applyFireState(state: Record<string, unknown>, fireState: FireState): void {
  if (!isRecord(state.environmentHazards)) {
    state.environmentHazards = {};
  }
  (state.environmentHazards as Record<string, unknown>).fire = structuredClone(fireState);
}

function includesAny(input: string, terms: string[]): boolean {
  return terms.some((term) => input.includes(term));
}

function isSplashOilAction(normalizedInput: string): boolean {
  return (
    normalizedInput.includes("splash oil") ||
    normalizedInput.includes("pour oil") ||
    normalizedInput.includes("spill oil") ||
    (normalizedInput.includes("oil") && includesAny(normalizedInput, ["splash", "pour", "spill", "coat", "douse"]))
  );
}

function isIgniteAction(normalizedInput: string): boolean {
  return (
    normalizedInput.includes("ignite") ||
    normalizedInput.includes("light") ||
    normalizedInput.includes("burn")
  );
}

function isThrowLanternAction(normalizedInput: string): boolean {
  return (
    (normalizedInput.includes("throw") && normalizedInput.includes("lantern")) ||
    (normalizedInput.includes("toss") && normalizedInput.includes("lantern")) ||
    (normalizedInput.includes("hurl") && normalizedInput.includes("lantern"))
  );
}

function makeFlagDelta(key: string, value: boolean, detail: string): Record<string, unknown> {
  return {
    kind: "flag.set",
    op: "flag.set",
    key,
    value,
    detail,
  };
}

function makeClockDelta(id: string, by: number, detail: string): Record<string, unknown> {
  return {
    kind: "clock.inc",
    op: "clock.inc",
    id,
    by,
    detail,
  };
}

function makeHazardDelta(fireState: FireState): Record<string, unknown> {
  return {
    kind: "hazard.set",
    op: "hazard.set",
    hazard: "fire",
    value: structuredClone(fireState),
  };
}

function makeHazardLedgerEntry(cause: string, effect: string, detail: string, fireState: FireState): Record<string, unknown> {
  return {
    kind: "environment.hazard",
    cause,
    effect,
    detail,
    data: {
      window: null,
      fire: fireState,
    },
  };
}

export function resolveFireHazardTurn(params: {
  state: Record<string, unknown>;
  input: string;
  mode: IntentMode;
  turnIndex?: number | null;
}): FireHazardTurnResult {
  const normalizedInput = params.input.trim().toLowerCase();
  const current = readFireState(params.state);
  const turnIndex = typeof params.turnIndex === "number" && Number.isFinite(params.turnIndex)
    ? params.turnIndex
    : getStateTurnIndex(params.state);
  const stateDeltas: Array<Record<string, unknown>> = [];
  const ledgerAdds: Array<Record<string, unknown>> = [];
  const nextFire: FireState = structuredClone(current);

  const canModify = params.mode === "DO";
  const wantsOil = canModify && isSplashOilAction(normalizedInput);
  const wantsIgnite = canModify && (isIgniteAction(normalizedInput) || isThrowLanternAction(normalizedInput));
  const shouldEvolve =
    current.status === "burning" &&
    turnIndex !== null &&
    current.ignitionTurnIndex !== null &&
    turnIndex > current.ignitionTurnIndex;

  if (wantsOil && current.status !== "burning") {
    nextFire.targetKey = DEFAULT_FIRE_TARGET_KEY;
    nextFire.status = "oiled";
    nextFire.createdTurnIndex = turnIndex ?? current.createdTurnIndex ?? null;
    nextFire.ignitionTurnIndex = null;
    nextFire.intensity = 0;
    nextFire.fuel = 3;
    stateDeltas.push(makeHazardDelta(nextFire));
    ledgerAdds.push(
      makeHazardLedgerEntry(
        "player.used_oil",
        "surface.oiled",
        "Oil spreads across the nearby surface, making it easy to ignite.",
        nextFire,
      ),
    );
  }

  if (wantsIgnite && current.status === "oiled") {
    nextFire.targetKey = DEFAULT_FIRE_TARGET_KEY;
    nextFire.status = "burning";
    nextFire.createdTurnIndex = current.createdTurnIndex ?? turnIndex ?? null;
    nextFire.ignitionTurnIndex = turnIndex ?? current.ignitionTurnIndex ?? null;
    nextFire.intensity = 1;
    nextFire.fuel = current.fuel > 0 ? current.fuel : 3;
    stateDeltas.push(makeHazardDelta(nextFire));
    stateDeltas.push(makeClockDelta(DEFAULT_ALERT_CLOCK_ID, 1, "The fire draws attention and heat."));
    stateDeltas.push(makeClockDelta(DEFAULT_NOISE_CLOCK_ID, 1, "The fire crackles loudly."));
    ledgerAdds.push(
      makeHazardLedgerEntry(
        "oil.ignited",
        "fire.started",
        "The oiled surface catches, and flame begins to spread.",
        nextFire,
      ),
    );
  } else if (wantsIgnite) {
    stateDeltas.push(makeHazardDelta(nextFire));
    ledgerAdds.push(
      makeHazardLedgerEntry(
        "fire.ignite_failed",
        current.status === "burning" ? "already burning" : "nothing_catches",
        current.status === "burning"
          ? "The fire is already burning."
          : "Nothing here catches, and no flame takes hold.",
        nextFire,
      ),
    );
  } else if (shouldEvolve) {
    const nextFuel = Math.max((current.fuel ?? 0) - 1, 0);
    if (nextFuel <= 0) {
      nextFire.status = "burned_out";
      nextFire.intensity = 0;
      nextFire.fuel = 0;
      nextFire.targetKey = null;
      nextFire.ignitionTurnIndex = current.ignitionTurnIndex;
      stateDeltas.push(makeHazardDelta(nextFire));
      ledgerAdds.push(
        makeHazardLedgerEntry(
          "fuel.spent",
          "fire.burned_out",
          "The flames consume what they can and begin to die down.",
          nextFire,
        ),
      );
    } else {
      nextFire.status = "burning";
      nextFire.fuel = nextFuel;
      nextFire.intensity = Math.min(3, current.intensity + 1) as 1 | 2 | 3;
      stateDeltas.push(makeHazardDelta(nextFire));
      stateDeltas.push(makeClockDelta(DEFAULT_ALERT_CLOCK_ID, 1, "The fire spreads and heats the room."));
      if (nextFire.intensity >= 3) {
        stateDeltas.push(makeClockDelta(DEFAULT_NOISE_CLOCK_ID, 1, "The flames crackle and snap."));
      }
      ledgerAdds.push(
        makeHazardLedgerEntry(
          nextFire.intensity >= 3 ? "fire.growing" : "fire.spread",
          "fire.intensity_increased",
          `The flames spread outward and the heat builds. Fuel remaining: ${nextFuel}.`,
          nextFire,
        ),
      );
    }
  }

  return {
    fireState: nextFire,
    stateDeltas,
    ledgerAdds,
  };
}
