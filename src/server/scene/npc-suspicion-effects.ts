export type NpcSuspicionEffect = "npc.suspicious" | "npc.alerted" | "npc.hostile-watch";

export function resolveNpcSuspicionEffect(npcSuspicion: number): NpcSuspicionEffect | null {
  if (npcSuspicion >= 3) return "npc.hostile-watch";
  if (npcSuspicion >= 2) return "npc.alerted";
  if (npcSuspicion >= 1) return "npc.suspicious";
  return null;
}
