import { WORLD_FLAGS, normalizeFlagKey } from "@/lib/engine/worldFlags";

export type PositionState = "hidden" | "contested" | "exposed";

const isTruthyFlag = (flags: Record<string, unknown>, key: string): boolean =>
  Boolean(flags[normalizeFlagKey(key)] ?? flags[key]);

export function resolvePositionState(flags?: Record<string, unknown> | null): PositionState | null {
  if (!flags) return null;
  const normalized = flags;
  const exposed =
    isTruthyFlag(normalized, WORLD_FLAGS.status.exposed) ||
    isTruthyFlag(normalized, WORLD_FLAGS.player.revealed) ||
    isTruthyFlag(normalized, WORLD_FLAGS.status.pressureExposed) ||
    isTruthyFlag(normalized, WORLD_FLAGS.position.compromised);
  const hidden =
    isTruthyFlag(normalized, WORLD_FLAGS.status.hidden) ||
    isTruthyFlag(normalized, WORLD_FLAGS.status.covered);

  if (exposed) return "exposed";
  if (hidden) return "hidden";

  if (
    isTruthyFlag(normalized, WORLD_FLAGS.guard.searching) ||
    isTruthyFlag(normalized, WORLD_FLAGS.guard.alerted) ||
    isTruthyFlag(normalized, WORLD_FLAGS.pressure.actionConstraint)
  ) {
    return "contested";
  }

  return null;
}

export function normalizePositionFlags(flags?: Record<string, unknown> | null): Record<string, unknown> {
  if (!flags) return {};
  const normalized = { ...flags };
  const positionState = resolvePositionState(normalized);
  if (positionState === "exposed") {
    normalized[WORLD_FLAGS.status.hidden] = false;
    normalized[WORLD_FLAGS.status.covered] = false;
  } else if (positionState === "hidden") {
    normalized[WORLD_FLAGS.status.exposed] = false;
    normalized[WORLD_FLAGS.player.revealed] = false;
    normalized[WORLD_FLAGS.status.pressureExposed] = false;
    normalized[WORLD_FLAGS.position.compromised] = false;
  }
  return normalized;
}
