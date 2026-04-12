import { DEFAULT_ALERT_CLOCK_ID, DEFAULT_NOISE_CLOCK_ID } from "@/lib/game/bootstrap";

type PressureTotals = {
  noise: number;
  danger: number;
  suspicion: number;
  time: number;
};

const coerceNumber = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

export function buildStatsMap(statsSource: unknown): Record<string, number> {
  const map: Record<string, number> = {};
  if (Array.isArray(statsSource)) {
    for (const entry of statsSource) {
      const record = asRecord(entry);
      if (!record) continue;
      const key = typeof record.key === "string" ? record.key.toLowerCase() : null;
      if (!key) continue;
      map[key] = coerceNumber(record.value);
    }
    return map;
  }
  const record = asRecord(statsSource);
  if (record) {
    for (const [key, value] of Object.entries(record)) {
      map[key.toLowerCase()] = coerceNumber(value);
    }
  }
  return map;
}

const readClock = (clocks: Record<string, unknown> | null, clockId: string): number => {
  if (!clocks) return 0;
  const clock = asRecord(clocks[clockId]);
  if (!clock) return 0;
  return coerceNumber(clock.value ?? clock.current ?? 0);
};

const readStat = (stats: Record<string, number>, keys: string[]): number => {
  for (const key of keys) {
    const normalized = key.toLowerCase();
    const value = stats[normalized];
    if (value !== undefined) return value;
  }
  return 0;
};

export function derivePressureTotals(state: Record<string, unknown>): PressureTotals {
  const world = asRecord(state.world);
  const clocks = asRecord(world?.clocks) ?? null;
  const statsMap = buildStatsMap(state.stats);

  return {
    noise: readClock(clocks, DEFAULT_NOISE_CLOCK_ID) || readStat(statsMap, ["noise"]),
    danger:
      readClock(clocks, DEFAULT_ALERT_CLOCK_ID) ||
      readStat(statsMap, ["danger", "alert", "position penalty"]),
    suspicion: readStat(statsMap, ["suspicion", "npc suspicion"]),
    time: readStat(statsMap, ["time", "time advance"]),
  };
}
