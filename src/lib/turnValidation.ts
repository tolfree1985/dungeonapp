import type { StateDelta } from "./applyStateDeltas";

/**
 * Allowed delta operations.
 * Anything else is rejected before touching state or DB.
 */
const ALLOWED_OPS = new Set<StateDelta["op"]>([
  "setFlag",
  "clearFlag",
  "incClock",
  "decClock",
  "setLocation",
  "addItem",
  "removeItem",
  "addCondition",
  "removeCondition",
]);

const CLOCK_PATH_RE = /^.+\.clocks\[[a-zA-Z0-9_-]+\]$/;

export function validateStateDeltas(deltas: unknown): asserts deltas is StateDelta[] {
  if (!Array.isArray(deltas)) {
    throw new Error("stateDeltas must be an array");
  }

  for (let i = 0; i < deltas.length; i++) {
    const d: any = deltas[i];

    if (!d || typeof d !== "object") {
      throw new Error(`Delta[${i}] is not an object`);
    }

    if (!ALLOWED_OPS.has(d.op)) {
      throw new Error(`Delta[${i}] has invalid op: ${String(d.op)}`);
    }

    if (typeof d.path !== "string" || d.path.length === 0) {
      throw new Error(`Delta[${i}] missing or invalid path`);
    }

    // Clock-specific checks
    if (d.op === "incClock" || d.op === "decClock") {
      if (!CLOCK_PATH_RE.test(d.path)) {
        throw new Error(
          `Delta[${i}] clock path must match "*.clocks[clock_id]": ${d.path}`
        );
      }
      if (typeof d.by !== "number" || !Number.isFinite(d.by)) {
        throw new Error(`Delta[${i}] clock delta must have numeric "by"`);
      }
    }

    // Item ops
    if (d.op === "addItem" && typeof d.item !== "object") {
      throw new Error(`Delta[${i}] addItem requires item`);
    }

    if (d.op === "removeItem" && typeof d.itemId !== "string") {
      throw new Error(`Delta[${i}] removeItem requires itemId`);
    }

    // Condition ops
    if (d.op === "addCondition" && typeof d.condition !== "object") {
      throw new Error(`Delta[${i}] addCondition requires condition`);
    }

    if (d.op === "removeCondition" && typeof d.conditionId !== "string") {
      throw new Error(`Delta[${i}] removeCondition requires conditionId`);
    }
  }
}
