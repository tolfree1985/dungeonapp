// src/lib/determinism.ts
import crypto from "node:crypto";

/**
 * Deterministic SHA-256 hex digest of a UTF-8 string.
 */
export function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * JSON type for canonicalization/hashing.
 * NOTE: undefined is intentionally excluded; JSON.stringify drops it.
 */
export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [k: string]: Json };

/**
 * Canonicalize JSON by sorting object keys recursively.
 * Arrays preserve order (caller must ensure deterministic array order).
 */
function canonicalize(value: Json): Json {
  if (value === null) return null;
  if (typeof value !== "object") return value;

  if (Array.isArray(value)) {
    return value.map((v) => canonicalize(v));
  }

  const obj = value as Record<string, Json>;
  const out: Record<string, Json> = {};
  const keys = Object.keys(obj).sort();
  for (const k of keys) {
    out[k] = canonicalize(obj[k]);
  }
  return out;
}

/**
 * Stable string representation used for hashing.
 */
export function canonicalJson(value: Json): string {
  return JSON.stringify(canonicalize(value));
}

/**
 * Deterministic hash of a JSON value (after canonicalization).
 */
export function hashJson(value: Json): string {
  return sha256Hex(canonicalJson(value));
}

/**
 * Engine may return drafts; route finalizes ledger entries deterministically.
 */
export type LedgerAddDraft = {
  kind: string;
  subject: string;
  effect: string;
  /**
   * Optional indices into deltas[] that caused this ledger entry.
   * If omitted, causedBy.deltaHashes will be [] (still deterministic).
   */
  deltaIdx?: number[];
};

export type LedgerEntryV2 = {
  id: string; // deterministic sha256 of entry content (without id)
  t: number; // seq
  kind: string;
  subject: string;
  effect: string;
  causedBy: {
    inputHash: string;
    deltaHashes: string[];
  };
};

/**
 * Hash each delta deterministically.
 * deltaHash[i] = sha256(canonicalJson(deltas[i]))
 */
export function computeDeltaHashes(deltas: unknown[]): string[] {
  return deltas.map((d) => hashJson(d as Json));
}

/**
 * Deterministic set-like uniq while preserving first-seen order.
 */
function uniqPreserveOrder(xs: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of xs) {
    if (!seen.has(x)) {
      seen.add(x);
      out.push(x);
    }
  }
  return out;
}

/**
 * Finalize ledger drafts into deterministic ledger entries.
 *
 * Rules:
 * - t is stamped as seq
 * - causedBy.inputHash is stamped
 * - causedBy.deltaHashes are resolved via deltaIdx -> deltaHashes
 * - id = sha256(canonicalJson({t,kind,subject,effect,causedBy}))
 *
 * Throws on invalid deltaIdx to prevent silent nondeterminism.
 */
export function finalizeLedgerAdds(args: {
  seq: number;
  inputHash: string;
  deltaHashes: string[];
  ledgerAddsDraft?: LedgerAddDraft[];
}): LedgerEntryV2[] {
  const { seq, inputHash, deltaHashes, ledgerAddsDraft } = args;

  if (!ledgerAddsDraft?.length) return [];

  const out: LedgerEntryV2[] = [];

  for (const draft of ledgerAddsDraft) {
    const idxs = draft.deltaIdx ?? [];

    const causedDeltaHashes = uniqPreserveOrder(
      idxs.map((i) => {
        if (!Number.isInteger(i) || i < 0 || i >= deltaHashes.length) {
          throw new Error("ledgerAddsDraft.deltaIdx out of range");
        }
        return deltaHashes[i];
      })
    );

    const entryNoId = {
      t: seq,
      kind: draft.kind,
      subject: draft.subject,
      effect: draft.effect,
      causedBy: {
        inputHash,
        deltaHashes: causedDeltaHashes,
      },
    } satisfies Omit<LedgerEntryV2, "id">;

    const id = hashJson(entryNoId as unknown as Json);

    out.push({
      id,
      ...entryNoId,
    });
  }

  return out;
}