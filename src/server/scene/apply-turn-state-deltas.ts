import type { FailForwardStateDelta } from "@/server/scene/fail-forward-state-delta";
import type { OpportunityCostEffect } from "@/server/scene/opportunity-cost-effects";

type LooseRecord = Record<string, unknown>;

function asRecord(value: unknown): LooseRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as LooseRecord;
}

function addNumericField(stats: LooseRecord, field: string, value: number): boolean {
  const existing = typeof stats[field] === "number" ? (stats[field] as number) : 0;
  const next = existing + value;
  if (next === existing) return false;
  stats[field] = next;
  return true;
}

export function applyTurnStateDeltas(stateRecord: LooseRecord, turnStateDeltas: unknown[]): void {
  if (!Array.isArray(turnStateDeltas) || turnStateDeltas.length === 0) return;

  const stats = asRecord(stateRecord.stats) ?? {};
  let mutated = false;

  for (const delta of turnStateDeltas) {
    const record = asRecord(delta);
    if (!record) continue;
    const detail = asRecord(record.detail);
    if (!detail) continue;

    const numericDelta: Partial<FailForwardStateDelta & OpportunityCostEffect> = {};
    if (typeof detail.noise === "number") numericDelta.noise = detail.noise;
    if (typeof detail.positionPenalty === "number") numericDelta.positionPenalty = detail.positionPenalty;
    if (typeof detail.timeAdvance === "number") numericDelta.timeAdvance = detail.timeAdvance;
    if (typeof detail.npcSuspicion === "number") numericDelta.npcSuspicion = detail.npcSuspicion;
    if (typeof detail.riskLevelDelta === "number") numericDelta.riskLevel = detail.riskLevelDelta;
    if (typeof detail.costBudgetDelta === "number") numericDelta.costBudget = detail.costBudgetDelta;

    for (const [field, value] of Object.entries(numericDelta) as Array<[keyof FailForwardStateDelta, number]>) {
      mutated = addNumericField(stats, field, value) || mutated;
    }
  }

  if (mutated) {
    stateRecord.stats = { ...stats };
  }
}
