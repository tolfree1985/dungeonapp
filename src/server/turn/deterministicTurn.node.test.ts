import assert from "node:assert/strict";
import test from "node:test";

import { createInitialStateV1 } from "@/lib/game/bootstrap";
import { PRESSURE_EFFECTS, resolveDeterministicTurn } from "@/server/turn/deterministicTurn";

test("deterministic turn pressure effects replay identically for WAIT under danger pressure", () => {
  const previousState = {
    ...createInitialStateV1(),
    stats: {
      alert: 5,
      noise: 1,
      heat: 1,
      time: 5,
      trust: 0,
      location: "room_start",
      turns: 4,
    },
  };

  const input = {
    playerText: "wait and listen",
    previousState,
    turnIndex: 5,
  };

  const first = resolveDeterministicTurn(input);
  const second = resolveDeterministicTurn(input);

  assert.deepEqual(first, second);

  const danger = PRESSURE_EFFECTS.danger;
  assert.equal(
    first.stateDeltas.some(
      (delta) => delta.key === "wait.heat.turn_5" && delta.label === "Heat" && delta.after === 1 + danger.waitHeatInc,
    ),
    true,
  );
  assert.equal(
    first.stateDeltas.some(
      (delta) => delta.op === "clock.inc" && delta.id === "clk_alert" && delta.by === danger.waitAlertInc,
    ),
    true,
  );
  assert.equal(
    first.ledgerAdds.some(
      (entry) =>
        entry.cause === "pressure" &&
        entry.effect === "Because you waited while pressure was danger, hostile attention intensified.",
    ),
    true,
  );
});

test("post-turn reactions replay identically when noise peak and crisis thresholds are crossed", () => {
  const previousState = {
    ...createInitialStateV1(),
    world: {
      ...createInitialStateV1().world,
      clocks: {
        ...createInitialStateV1().world.clocks,
        clk_noise: {
          ...createInitialStateV1().world.clocks.clk_noise,
          value: 2,
        },
        clk_alert: {
          ...createInitialStateV1().world.clocks.clk_alert,
          value: 5,
        },
      },
    },
    stats: {
      alert: 7,
      noise: 2,
      heat: 7,
      time: 5,
      trust: 0,
      location: "room_start",
      turns: 6,
    },
  };

  const input = {
    playerText: "wait and listen",
    previousState,
    turnIndex: 8,
  };

  const first = resolveDeterministicTurn(input);
  const second = resolveDeterministicTurn(input);

  assert.deepEqual(first, second);
  assert.equal(first.stateDeltas.some((delta) => delta.key === "threat.noise_peak" && delta.value === true), true);
  assert.equal(first.stateDeltas.some((delta) => delta.key === "threat.lockdown" && delta.value === true), true);
  assert.equal(
    first.ledgerAdds.some((entry) => entry.effect === "Accumulated noise has drawn sustained hostile attention."),
    true,
  );
  assert.equal(
    first.ledgerAdds.some(
      (entry) => entry.effect === "Pressure has reached crisis, triggering an active hostile response.",
    ),
    true,
  );
  const quests = Array.isArray(first.nextState.quests) ? first.nextState.quests : [];
  const inf = quests.find((quest) => quest.id === "infiltration");
  assert.equal(inf?.stage, "Bypass security");
});
