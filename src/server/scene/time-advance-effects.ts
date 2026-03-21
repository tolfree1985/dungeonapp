import type { EncounterPhase } from "@/server/scene/scene-identity";

export type TimeAdvanceEffect = "time.scene-prolonged" | "time.deadline-pressure";

export function resolveTimeAdvanceEffect(params: {
  timeAdvance: number;
  pressure: number;
  encounterPhase: EncounterPhase;
}): TimeAdvanceEffect | null {
  const { timeAdvance, pressure } = params;
  if (timeAdvance <= 0) return null;
  if (pressure >= 3) return "time.deadline-pressure";
  return "time.scene-prolonged";
}
