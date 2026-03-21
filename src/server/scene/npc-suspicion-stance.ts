export type NpcSuspicionStance = "calm" | "suspicious" | "alerted" | "hostile-watch";

export function resolveNpcSuspicionStance(value: number): NpcSuspicionStance {
  if (value >= 3) {
    return "hostile-watch";
  }
  if (value >= 2) {
    return "alerted";
  }
  if (value >= 1) {
    return "suspicious";
  }
  return "calm";
}
