/**
 * Deterministic PRNG (mulberry32).
 * Stable across Node versions and fast.
 */
export function mulberry32(seed: number) {
  return function rng() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function d6(rng: () => number): number {
  return 1 + Math.floor(rng() * 6);
}

/**
 * Utility to derive a per-turn seed from base seed + turnIndex.
 * Keeps replay deterministic while ensuring different turns differ.
 */
export function seedForTurn(baseSeed: number, turnIndex: number): number {
  // simple mixing; deterministic
  const x = (baseSeed | 0) ^ Math.imul((turnIndex + 1) | 0, 0x9e3779b1);
  return x | 0;
}
