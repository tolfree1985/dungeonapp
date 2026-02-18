// src/lib/game/hash.ts
import crypto from "crypto";

/**
 * Deterministic canonicalization:
 * - Sort object keys recursively
 * - Drop undefined values
 * - Preserve array order
 */
export function canonicalize(value: unknown): unknown {
  if (value === null) return null;

  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const out: Record<string, unknown> = {};
    for (const k of keys) {
      const v = obj[k];
      if (v === undefined) continue;
      out[k] = canonicalize(v);
    }
    return out;
  }

  // primitives (string/number/boolean) + others
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

/** Hash structured state only (no pretty text). */
export function hashState(state: unknown): string {
  return sha256Hex(canonicalJson(state));
}

/** Hash normalized player input / command payload. */
export function hashInput(normalizedInput: unknown): string {
  return sha256Hex(canonicalJson(normalizedInput));
}

/**
 * Tamper-evident hash for an event “envelope”.
 * Keep payload structured and deterministic.
 */
export function hashEventEnvelope(args: {
  prevEventId: string | null;
  prevStateHash: string;
  engineVersion: string;
  inputHash: string;
  payload: unknown;
}): string {
  return sha256Hex(
    canonicalJson({
      prevEventId: args.prevEventId,
      prevStateHash: args.prevStateHash,
      engineVersion: args.engineVersion,
      inputHash: args.inputHash,
      payload: args.payload,
    })
  );
}