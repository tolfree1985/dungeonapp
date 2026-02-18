import assert from "node:assert/strict";
import { getConsequences } from "../src/lib/consequences";

function main() {
  // Odd/missing inputs should normalize to empty arrays.
  const odd = getConsequences({
    stateDeltas: "not-an-array" as unknown as unknown[],
    ledgerAdds: { nope: true } as unknown as unknown[],
  });
  assert(Array.isArray(odd.stateDeltas), "stateDeltas must be array");
  assert(Array.isArray(odd.ledgerAdds), "ledgerAdds must be array");
  assert.equal(odd.stateDeltas.length, 0, "stateDeltas should default to []");
  assert.equal(odd.ledgerAdds.length, 0, "ledgerAdds should default to []");

  // Provided arrays must preserve order and reference identity.
  const stateDeltas = [{ op: "a" }, { op: "b" }, { op: "c" }];
  const ledgerAdds = [{ id: 3 }, { id: 1 }, { id: 2 }];
  const normalized = getConsequences({ stateDeltas, ledgerAdds });
  assert.equal(normalized.stateDeltas, stateDeltas, "stateDeltas reference must be preserved");
  assert.equal(normalized.ledgerAdds, ledgerAdds, "ledgerAdds reference must be preserved");
  assert.deepEqual(
    normalized.stateDeltas,
    [{ op: "a" }, { op: "b" }, { op: "c" }],
    "stateDeltas order must be preserved"
  );
  assert.deepEqual(
    normalized.ledgerAdds,
    [{ id: 3 }, { id: 1 }, { id: 2 }],
    "ledgerAdds order must be preserved"
  );

  console.log("CONSEQUENCES ADAPTER OK");
}

main();
