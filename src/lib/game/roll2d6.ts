// src/lib/game/roll2d6.ts

export type Roll2d6Result = {
  d1: number;
  d2: number;
  total: number;
};

function mulberry32(seed: number) {
  let a = seed | 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function die6(rng: () => number): number {
  return 1 + Math.floor(rng() * 6);
}

export function roll2d6(seed: number): Roll2d6Result {
  const rng = mulberry32(seed | 0);
  const d1 = die6(rng);
  const d2 = die6(rng);
  return { d1, d2, total: d1 + d2 };
}

