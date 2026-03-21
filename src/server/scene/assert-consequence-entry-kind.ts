import type { ConsequenceEntry, ConsequenceKind } from "@/server/scene/consequence-bundle";

export function assertConsequenceEntryKind(entry: ConsequenceEntry, expected: ConsequenceKind): void {
  if (entry.kind !== expected) {
    throw new Error(`Consequence entry ${entry.id} expected kind ${expected}, got ${entry.kind}`);
  }
}
