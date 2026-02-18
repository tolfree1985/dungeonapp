// src/lib/game/deltas.ts
// Minimal delta typing for ENGINE_CONTRACT_V1.
// Keep permissive: runtime reducers/validators enforce correctness.
// Determinism note: typing only; no runtime logic here.

export type StateDelta = {
  op: string;
  [k: string]: any;
};
