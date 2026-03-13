export type TurnHealthSummary = {
  userId: string;
  adventureId: string;
  branch: "legacy" | "pipeline";
  normalizedInputLength: number;
  idempotencyKey: string | null;
  softRateAllowed: boolean;
  usageAllowed: boolean;
  durationMs: number;
  success: boolean;
};

export type StructuredFailure = {
  context: string;
  userId?: string;
  adventureId?: string;
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export function logTurnHealthSummary(summary: TurnHealthSummary) {
  console.info("turn.health", summary);
}

export function logStructuredFailure(failure: StructuredFailure) {
  console.error("turn.failure", failure);
}
