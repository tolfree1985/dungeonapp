import type { TurnGuardVerdict } from "./types";

export type TurnGuardInputs = {
  userId: string;
  adventureId: string;
  flags: {
    TURN_PIPELINE?: boolean;
  };
  request: {
    inputChars?: number;
    idempotencyKey?: string | null;
    softRate?: { allowed: boolean; retryAfterMs?: number; reason?: string } | null;
  };
  context?: {
    adventureLocked?: boolean;
    usageVerdict?: { allowed: boolean; retryAfterMs?: number; reason?: string } | null;
  };
};

export function getTurnGuardVerdict(inputs: TurnGuardInputs): TurnGuardVerdict {
  const { request, context } = inputs;

  if (typeof request.inputChars === "number" && request.inputChars <= 0) {
    return {
      allowed: false,
      code: "INVALID_INPUT",
      reason: "Missing input for the turn.",
      debug: { inputChars: request.inputChars },
    };
  }

  if (context?.adventureLocked) {
    return {
      allowed: false,
      code: "ADVENTURE_LOCKED",
      reason: "That adventure is busy.",
      retryAfterMs: 1500,
    };
  }

  if (request.softRate && !request.softRate.allowed) {
    return {
      allowed: false,
      code: "SOFT_RATE",
      reason: request.softRate.reason ?? "You're making too many turns.",
      retryAfterMs: request.softRate.retryAfterMs ?? 1500,
      debug: { softRate: request.softRate },
    };
  }

  if (context?.usageVerdict && !context.usageVerdict.allowed) {
    return {
      allowed: false,
      code: "USAGE_LIMIT",
      reason: context.usageVerdict.reason ?? "Usage limits exceeded.",
      retryAfterMs: context.usageVerdict.retryAfterMs,
      debug: { usageVerdict: context.usageVerdict },
    };
  }

  return { allowed: true };
}
