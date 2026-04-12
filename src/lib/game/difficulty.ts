import type { AdventureState } from "@/lib/engine/types/state";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

export function getDifficultyModifier(state: AdventureState, key: string): number {
  const modifiers = asRecord((state as Record<string, unknown>).modifiers ?? null);
  if (!modifiers) return 0;
  const value = modifiers[key];
  return typeof value === "number" ? value : 0;
}

export function getEffectiveDifficulty(baseDifficulty: number, state: AdventureState, key: string): number {
  return baseDifficulty + getDifficultyModifier(state, key);
}

export function isActionBlocked(state: AdventureState, actionKey: string): boolean {
  const blocked = asRecord((state as Record<string, unknown>).blockedActions ?? null);
  if (!blocked) return false;
  return Boolean(blocked[actionKey]);
}
