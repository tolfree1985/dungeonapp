export const SCENARIO_VERSION = 1 as const;

const HASH_EXCLUDED_KEYS = new Set([
  "determinismReport",
  "editorState",
  "editorUi",
  "editorMetadata",
  "uiMetadata",
  "_editor",
  "scenarioVersion",
  "scenarioContentHash",
]);

const TOP_LEVEL_KEY_ORDER = [
  "version",
  "id",
  "title",
  "summary",
  "initialState",
  "start",
  "turns",
  "events",
  "scenes",
  "cards",
  "memoryCards",
  "storyCards",
] as const;

const TOP_LEVEL_KEY_INDEX = new Map<string, number>(
  TOP_LEVEL_KEY_ORDER.map((key, index) => [key, index]),
);

function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function orderScenarioKeys(keys: string[], depth: number): string[] {
  if (depth !== 0) {
    return keys.sort(compareText);
  }

  return keys.sort((a, b) => {
    const ai = TOP_LEVEL_KEY_INDEX.get(a);
    const bi = TOP_LEVEL_KEY_INDEX.get(b);
    if (ai == null && bi == null) return compareText(a, b);
    if (ai == null) return 1;
    if (bi == null) return -1;
    if (ai === bi) return compareText(a, b);
    return ai - bi;
  });
}

function normalizeScenarioForHash(value: unknown, depth: number): unknown {
  if (value === undefined) return null;
  if (value === null) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeScenarioForHash(entry, depth + 1));
  }
  if (isRecord(value)) {
    const out: Record<string, unknown> = {};
    const keys = orderScenarioKeys(
      Object.keys(value).filter((key) => !HASH_EXCLUDED_KEYS.has(key)),
      depth,
    );
    for (const key of keys) {
      out[key] = normalizeScenarioForHash(value[key], depth + 1);
    }
    return out;
  }
  return null;
}

function stableSerializeScenarioContent(scenarioJson: unknown): string {
  return JSON.stringify(normalizeScenarioForHash(scenarioJson, 0));
}

function rightRotate(value: number, amount: number): number {
  return (value >>> amount) | (value << (32 - amount));
}

function sha256Hex(input: string): string {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  const H = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];

  const bytes = Array.from(new TextEncoder().encode(input));
  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while ((bytes.length % 64) !== 56) bytes.push(0);

  const bitLengthHi = Math.floor(bitLength / 0x100000000);
  const bitLengthLo = bitLength >>> 0;
  bytes.push((bitLengthHi >>> 24) & 0xff, (bitLengthHi >>> 16) & 0xff, (bitLengthHi >>> 8) & 0xff, bitLengthHi & 0xff);
  bytes.push((bitLengthLo >>> 24) & 0xff, (bitLengthLo >>> 16) & 0xff, (bitLengthLo >>> 8) & 0xff, bitLengthLo & 0xff);

  for (let offset = 0; offset < bytes.length; offset += 64) {
    const w = new Array<number>(64).fill(0);
    for (let i = 0; i < 16; i++) {
      const j = offset + i * 4;
      w[i] = ((bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3]) >>> 0;
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rightRotate(w[i - 15], 7) ^ rightRotate(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rightRotate(w[i - 2], 17) ^ rightRotate(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = H[0];
    let b = H[1];
    let c = H[2];
    let d = H[3];
    let e = H[4];
    let f = H[5];
    let g = H[6];
    let h = H[7];

    for (let i = 0; i < 64; i++) {
      const S1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    H[0] = (H[0] + a) >>> 0;
    H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0;
    H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0;
    H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0;
    H[7] = (H[7] + h) >>> 0;
  }

  return H.map((part) => part.toString(16).padStart(8, "0")).join("");
}

export function computeScenarioContentHash(scenarioJson: unknown): string {
  return sha256Hex(stableSerializeScenarioContent(scenarioJson));
}

export function buildScenarioVersionStamp(scenarioJson: unknown): {
  scenarioVersion: typeof SCENARIO_VERSION;
  contentHash: string;
} {
  return {
    scenarioVersion: SCENARIO_VERSION,
    contentHash: computeScenarioContentHash(scenarioJson),
  };
}
