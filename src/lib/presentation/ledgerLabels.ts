import type { LedgerEntry } from "@/lib/engine/resolveTurnContract";

type LedgerTextMapping = {
  predicate: (value: string) => boolean;
  label: string;
};

const LEDGER_TEXT_MAPPINGS: LedgerTextMapping[] = [
  { predicate: (value) => value.includes("pressure"), label: "Pressure increased" },
  { predicate: (value) => value.includes("time"), label: "Time advanced" },
  { predicate: (value) => value.includes("position") && value.includes("worsened"), label: "Your position worsened" },
  { predicate: (value) => value.includes("observation"), label: "Clue recovered" },
  { predicate: (value) => value.includes("risk"), label: "Risk increased" },
  { predicate: (value) => value.includes("noise"), label: "Noise disturbed" },
  { predicate: (value) => value.includes("suspicion"), label: "Suspicion rises" },
  { predicate: (value) => value.includes("burn") || value.includes("fire"), label: "The environment heats up" },
  { predicate: (value) => value.includes("search"), label: "Investigation deepens" },
  { predicate: (value) => value.includes("guard"), label: "Guards take notice" },
  { predicate: (value) => value.includes("obstacle"), label: "Obstacle cleared" },
  { predicate: (value) => value.includes("door"), label: "Door moved" },
  { predicate: (value) => value.includes("scene"), label: "Scene shifted" },
];

export function mapLedgerText(value: string): string {
  const lower = value.toLowerCase();
  for (const mapping of LEDGER_TEXT_MAPPINGS) {
    if (mapping.predicate(lower)) {
      return mapping.label;
    }
  }
  return value;
}

export function toPlayerFacingLabel(entry: LedgerEntry): string {
  const candidate = (entry.effect ?? entry.cause ?? "").trim();
  if (!candidate) return "Situation changed";
  return mapLedgerText(candidate);
}
