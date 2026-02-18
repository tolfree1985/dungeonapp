import crypto from "crypto";

export function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

export function stableStringify(value: any): string {
  if (value === null || value === undefined) return JSON.stringify(value);
  const t = typeof value;

  if (t === "number" || t === "boolean" || t === "string") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  if (t === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
  }

  return JSON.stringify(value);
}

export function computeEnvelopeHash(args: {
  v: 2;
  inputHash: string;
  deltaHashes: string[];
  ledgerAddIds: string[];
}): string {
  return sha256Hex(stableStringify(args));
}

/** v2 chain hash (new)
 * sha256(stableStringify({ v:2, prevEnvelopeHash, inputHash, deltaHashes, ledgerAddIds }))
 */
export function computeChainHash(args: {
  v: 2;
  prevEnvelopeHash: string | null;
  inputHash: string;
  deltaHashes: string[];
  ledgerAddIds: string[];
}): string {
  return sha256Hex(stableStringify(args));
}
