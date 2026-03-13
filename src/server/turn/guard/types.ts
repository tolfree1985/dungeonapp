export type TurnGuardDenyCode =
  | "USAGE_LIMIT"
  | "SOFT_RATE"
  | "ADVENTURE_LOCKED"
  | "IDEMPOTENCY_CONFLICT"
  | "INVALID_INPUT"
  | "FEATURE_DISABLED"
  | "UNKNOWN_DENY";

export type TurnGuardVerdict =
  | { allowed: true }
  | {
      allowed: false;
      code: TurnGuardDenyCode;
      reason: string;
      retryAfterMs?: number;
      debug?: Record<string, unknown>;
    };
