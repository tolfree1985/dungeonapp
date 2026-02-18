export type BillingErrorCode =
  | "INVALID_INPUT"
  | "BUDGET_EXCEEDED"
  | "MONTHLY_TOKEN_CAP_EXCEEDED"
  | "OUTPUT_CAP_EXCEEDED"
  | "PER_TURN_OUTPUT_CAP_EXCEEDED"
  | "CONCURRENCY_LIMIT"
  | "CONCURRENCY_LIMIT_EXCEEDED"
  | "LEASE_CONFLICT"
  | "HOLD_CONFLICT"
  | "NOT_FOUND"
  | "INVARIANT";

export class BillingError extends Error {
  readonly code: BillingErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: BillingErrorCode,
    message: string,
    status = 400,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}
