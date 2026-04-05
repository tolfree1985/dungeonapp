import type { LedgerEntry } from "@/lib/engine/resolveTurnContract";

export function toPlayerFacingLabel(entry: LedgerEntry): string {
  const key = (entry.effect ?? entry.cause ?? "").toLowerCase();
  if (key.includes("pressure")) return "Pressure increased";
  if (key.includes("time")) return "Time advanced";
  if (key.includes("position") && key.includes("worsened")) return "Your position worsened";
  if (key.includes("observation")) return "Clue recovered";
  if (key.includes("risk")) return "Risk increased";
  if (key.includes("noise")) return "Noise disturbed";
  if (key.includes("suspicion")) return "Suspicion rises";
  if (key.includes("burn") || key.includes("fire")) return "The environment heats up";
  if (key.includes("search")) return "Investigation deepens";
  if (key.includes("guard")) return "Guards take notice";
  return entry.effect ? entry.effect : entry.cause ? entry.cause : "Situation changed";
}
