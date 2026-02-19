import assert from "node:assert/strict";
import { validateScenarioDeterminism } from "../src/lib/scenario/validateScenarioDeterminism";

function main() {
  const invalidNamespace = validateScenarioDeterminism({
    turns: [
      {
        turnIndex: 0,
        stateDeltas: [{ op: "flag.set", path: "engine.meta.locked", value: true }],
        ledgerAdds: [{ id: "l0", turnIndex: 0 }],
      },
    ],
  });
  assert.deepEqual(invalidNamespace.errors, ["SCENARIO_DELTA_NAMESPACE_INVALID"]);

  const floatStats = validateScenarioDeterminism({
    turns: [
      {
        turnIndex: 0,
        stateDeltas: [{ op: "stats.set", path: "stats.hp", value: 1.5 }],
        ledgerAdds: [{ id: "l0", turnIndex: 0 }],
      },
    ],
  });
  assert.deepEqual(floatStats.errors, ["SCENARIO_FLOAT_STAT_MUTATION"]);

  const ledgerMismatch = validateScenarioDeterminism({
    turns: [
      {
        turnIndex: 0,
        stateDeltas: [{ op: "flag.set", path: "flags.opened", value: true }],
        ledgerAdds: [],
      },
    ],
  });
  assert.deepEqual(ledgerMismatch.errors, ["SCENARIO_LEDGER_DELTA_MISMATCH"]);

  const styleLockFlip = validateScenarioDeterminism({
    initialState: {
      world: {
        flags: {
          toneLock: "locked",
        },
      },
    },
    turns: [
      {
        turnIndex: 0,
        stateDeltas: [{ op: "flag.set", path: "flags.toneLock", value: "unlocked" }],
        ledgerAdds: [{ id: "l0", turnIndex: 0 }],
      },
    ],
  });
  assert.deepEqual(styleLockFlip.errors, ["SCENARIO_STYLE_LOCK_TRANSITION_INVALID"]);

  const styleLockEnumInvalid = validateScenarioDeterminism({
    initialState: {
      world: {
        flags: {
          toneLock: "cinematic",
        },
      },
    },
    turns: [
      {
        turnIndex: 0,
        stateDeltas: [{ op: "flag.set", path: "flags.opened", value: true }],
        ledgerAdds: [{ id: "l0", turnIndex: 0 }],
      },
    ],
  });
  assert.deepEqual(styleLockEnumInvalid.errors, ["SCENARIO_STYLE_LOCK_ENUM_INVALID"]);

  const duplicateTurn = validateScenarioDeterminism({
    turns: [
      { turnIndex: 1, stateDeltas: [], ledgerAdds: [] },
      { turnIndex: 1, stateDeltas: [], ledgerAdds: [] },
    ],
  });
  assert.deepEqual(duplicateTurn.errors, ["SCENARIO_TURN_INDEX_INVALID"]);

  const undefinedValue = validateScenarioDeterminism({
    turns: [
      {
        turnIndex: 0,
        stateDeltas: [{ op: "flag.set", path: "flags.opened", value: undefined }],
        ledgerAdds: [{ id: "l0", turnIndex: 0 }],
      },
    ],
  });
  assert.deepEqual(undefinedValue.errors, ["SCENARIO_UNDEFINED_DELTA_VALUE"]);

  const deadEndBranch = validateScenarioDeterminism({
    turns: [
      {
        turnIndex: 0,
        resolution: { tier: "fail" },
        stateDeltas: [],
        ledgerAdds: [],
      },
    ],
  });
  assert.deepEqual(deadEndBranch.errors, ["SCENARIO_DEAD_END_BRANCH"]);

  const validFailureBranchTransition = validateScenarioDeterminism({
    turns: [
      {
        turnIndex: 0,
        resolution: { tier: "fail" },
        nextTurnIndex: 1,
        stateDeltas: [],
        ledgerAdds: [],
      },
      {
        turnIndex: 1,
        stateDeltas: [{ op: "flag.set", path: "flags.recovered", value: true }],
        ledgerAdds: [{ id: "l1", turnIndex: 1 }],
      },
    ],
  });
  assert.equal(validFailureBranchTransition.valid, true);
  assert.deepEqual(validFailureBranchTransition.errors, []);

  const validLockedScenario = validateScenarioDeterminism({
    turns: [
      {
        turnIndex: 0,
        stateDeltas: [{ op: "flag.set", path: "flags.toneLock", value: "locked" }],
        ledgerAdds: [{ id: "l0", turnIndex: 0 }],
      },
      {
        turnIndex: 1,
        stateDeltas: [{ op: "flag.set", path: "flags.toneLock", value: "locked" }],
        ledgerAdds: [{ id: "l1", turnIndex: 1 }],
      },
    ],
  });
  assert.equal(validLockedScenario.valid, true);
  assert.deepEqual(validLockedScenario.errors, []);

  const validUnlockedScenario = validateScenarioDeterminism({
    turns: [
      {
        turnIndex: 0,
        stateDeltas: [{ op: "flag.set", path: "flags.genreLock", value: "unlocked" }],
        ledgerAdds: [{ id: "l0", turnIndex: 0 }],
      },
      {
        turnIndex: 1,
        stateDeltas: [{ op: "flag.set", path: "flags.genreLock", value: "unlocked" }],
        ledgerAdds: [{ id: "l1", turnIndex: 1 }],
      },
    ],
  });
  assert.equal(validUnlockedScenario.valid, true);
  assert.deepEqual(validUnlockedScenario.errors, []);

  const orderingScenario = validateScenarioDeterminism({
    initialState: {
      world: {
        flags: {
          toneLock: "locked",
        },
      },
    },
    turns: [
      {
        turnIndex: 0,
        stateDeltas: [{ op: "flag.set", path: "engine.meta.bad", value: true }],
        ledgerAdds: [{ id: "l0", turnIndex: 0 }],
      },
      {
        turnIndex: 1,
        stateDeltas: [{ op: "flag.set", path: "flags.toneLock", value: "unlocked" }],
        ledgerAdds: [{ id: "l1", turnIndex: 1 }],
      },
    ],
  });
  assert.deepEqual(orderingScenario.errors, [
    "SCENARIO_DELTA_NAMESPACE_INVALID",
    "SCENARIO_STYLE_LOCK_TRANSITION_INVALID",
  ]);

  console.log("SCENARIO DETERMINISM OK");
}

main();
