import type { OutcomeTier } from "./resolveTurnContract";

type ApplyWorldStateModifiersInput = {
  stateRecord: Record<string, unknown> | null;
  mode: "DO" | "SAY" | "LOOK";
};

export type WorldModifiers = {
  difficultyModifier: number;
  rollAdjustment: number;
  pressureMultiplier: number;
};

function readFlag(stateRecord: Record<string, unknown> | null, key: string): boolean {
  if (!stateRecord) return false;
  const flags = (stateRecord.flags ?? {}) as Record<string, unknown>;
  if (typeof flags[key] === "boolean") {
    return flags[key] as boolean;
  }
  const stats = (stateRecord.stats ?? {}) as Record<string, unknown>;
  const statValue = stats[key];
  if (typeof statValue === "number") return statValue > 0;
  return false;
}

export function applyWorldStateModifiers({ stateRecord, mode }: ApplyWorldStateModifiersInput): WorldModifiers {
  const guardAlerted = readFlag(stateRecord, "guard_alerted");
  const areaCompromised = readFlag(stateRecord, "area_compromised");
  const windowNarrowed = readFlag(stateRecord, "window_narrowed");
  const situationCritical = readFlag(stateRecord, "situation_critical");

  let difficultyModifier = 0;
  let rollAdjustment = 0;
  let pressureMultiplier = 1;

  if (guardAlerted && mode === "LOOK") {
    difficultyModifier += 2;
  }
  if (areaCompromised) {
    pressureMultiplier += 0.5;
  }
  if (windowNarrowed) {
    difficultyModifier += 1;
    pressureMultiplier += 0.25;
  }
  if (situationCritical) {
    difficultyModifier += 1;
    rollAdjustment += 1;
  }

  if (mode === "DO" && areaCompromised) {
    pressureMultiplier += 0.2;
  }
  if (mode === "SAY" && guardAlerted) {
    pressureMultiplier += 0.1;
  }

  return { difficultyModifier, rollAdjustment, pressureMultiplier };
}
