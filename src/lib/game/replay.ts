import { createInitialStateV1 } from "./bootstrap";
import { applyDeltas } from "./state";

/**
 * Deterministic replay of canonical event log payloads.
 *
 * NOTE: We allow an explicit "anchor" genesis event (seq=0) to omit deltas.
 * This enables fork/anchor strategies without rewriting history.
 */
export function replayStateFromTurnJson(
  events: Array<{ seq: number; turnJson: any }>,
  genesisState?: any
) {
  let state: any = genesisState ?? createInitialStateV1();

  for (const e of events) {
    const tj = e?.turnJson ?? {};

    // Anchor tolerance: seq=0 can be a pure anchor without deltas.
    // Accept if explicitly marked as an anchor-like kind.
    if (e.seq === 0 && !Array.isArray(tj?.deltas)) {
      const kind = typeof tj?.kind === "string" ? tj.kind : "";
      if (kind === "FORK_FROM_CHAIN" || kind === "ANCHOR" || kind === "GENESIS") {
        tj.deltas = [];
      }
    }

    const deltas = tj?.deltas;
    if (!Array.isArray(deltas)) {
      throw new Error(`Bad event payload: seq=${e.seq} missing turnJson.deltas[]`);
    }

    state = applyDeltas(state, deltas);
  }

  return state;
}
