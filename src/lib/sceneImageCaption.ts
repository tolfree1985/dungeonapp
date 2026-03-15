import type { VisualStateDelta } from "@/lib/resolveSceneVisualState";

export function getSceneImageUpdateCaption(deltas: VisualStateDelta[]): string | null {
  if (deltas.some((delta) => delta.key === "threat")) return "Threat draws near.";
  if (deltas.some((delta) => delta.key === "lighting")) return "Lighting flickers.";
  if (deltas.some((delta) => delta.key === "atmosphere")) return "Atmosphere grows tense.";
  if (deltas.some((delta) => delta.key === "wear")) return "The room shows fresh strain.";
  return null;
}
