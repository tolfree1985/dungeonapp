import { describe, expect, it } from "vitest";
import { createInitialStateV1, DEFAULT_ALERT_CLOCK_ID, DEFAULT_NOISE_CLOCK_ID } from "@/lib/game/bootstrap";
import { deriveMechanicFacts } from "@/lib/engine/presentation/mechanicFacts";
import { resolveDeterministicTurn } from "@/server/turn/deterministicTurn";
import { WORLD_FLAGS } from "@/lib/engine/worldFlags";

describe("deterministicTurn resolver", () => {
  it("emits door.forced flag and mechanic facts for force the door open", () => {
    const result = resolveDeterministicTurn({
      playerText: "force the door open",
      previousState: createInitialStateV1(),
      turnIndex: 162,
      mode: "DO",
    });
    const doorForcedDelta = result.stateDeltas.find(
      (delta) =>
        delta &&
        typeof delta === "object" &&
        (delta as Record<string, unknown>).op === "flag.set" &&
        (delta as Record<string, unknown>).key === "door.forced",
    );
    expect(doorForcedDelta).toBeDefined();
    const nextFlags = (result.nextState.world as Record<string, unknown>)?.flags as Record<string, unknown>;
    expect(nextFlags?.["door.forced"]).toBe(true);
    const mechanicFacts = deriveMechanicFacts({
      stateFlags: nextFlags,
      stateDeltas: result.stateDeltas,
      ledgerAdds: result.ledgerAdds,
    });
    expect(mechanicFacts.achieved.some((fact) => fact.id === "door_force_achieved")).toBe(true);
    expect(mechanicFacts.world.some((fact) => fact.id === "door_force_world")).toBe(true);
    expect(mechanicFacts.persistent.some((fact) => fact.id === "door_force_persistent")).toBe(true);
    expect(mechanicFacts.opportunities.some((fact) => fact.id === "door_force_opportunity")).toBe(true);
  });

  it("does not mutate door state when force the door open is run in LOOK mode", () => {
    const result = resolveDeterministicTurn({
      playerText: "force the door open",
      previousState: createInitialStateV1(),
      turnIndex: 162,
      mode: "LOOK",
    });
    const doorForcedDelta = result.stateDeltas.find(
      (delta) =>
        delta &&
        typeof delta === "object" &&
        (delta as Record<string, unknown>).kind === "flag.set" &&
        (delta as Record<string, unknown>).key === "door.forced",
    );
    expect(doorForcedDelta).toBeUndefined();
    const worldFlags = (result.nextState.world as Record<string, unknown>)?.flags as Record<string, unknown>;
    expect(worldFlags?.["door.forced"]).toBeUndefined();
    const mechanicFacts = deriveMechanicFacts({
      stateFlags: worldFlags,
      stateDeltas: result.stateDeltas,
      ledgerAdds: result.ledgerAdds,
    });
    expect(mechanicFacts).toBeNull();
  });

  it("treats inspect on the door as Success with no costs", () => {
    const result = resolveDeterministicTurn({
      playerText: "inspect the door",
      previousState: createInitialStateV1(),
      turnIndex: 263,
      mode: "LOOK",
    });
    expect(result.outcome).toBe("SUCCESS");
    expect(result.mechanicFacts).toBeDefined();
    const facts = result.mechanicFacts!;
    expect(facts.achieved.some((fact) => fact.text.includes("inspected the door"))).toBe(true);
    expect(facts.world.some((fact) => fact.text.includes("condition is now revealed"))).toBe(true);
    expect(facts.costs).toHaveLength(0);
    expect(facts.turnChanges).toHaveLength(0);
    expect(facts.careNow).toHaveLength(0);
  });

  it("keeps force the door as Success with Cost and unified panels", () => {
    const result = resolveDeterministicTurn({
      playerText: "force the door open",
      previousState: createInitialStateV1(),
      turnIndex: 262,
      mode: "DO",
    });
    expect(result.outcome).toBe("SUCCESS_WITH_COST");
    expect(result.mechanicFacts).toBeDefined();
    const facts = result.mechanicFacts!;
    expect(facts.achieved.some((fact) => fact.id === "door_force_achieved")).toBe(true);
    expect(facts.world.some((fact) => fact.id === "door_force_world")).toBe(true);
    expect(facts.costs.some((fact) => fact.id === "time_cost")).toBe(true);
    expect(facts.costs.some((fact) => fact.id === "noise_cost")).toBe(true);
    expect(facts.turnChanges.some((fact) => fact.id === "time_advanced")).toBe(true);
    expect(facts.turnChanges.some((fact) => fact.id === "noise_increased")).toBe(true);
    expect(facts.careNow.some((fact) => fact.id === "time_care")).toBe(true);
    expect(facts.careNow.some((fact) => fact.id === "noise_care")).toBe(true);
    expect(facts.opportunities.some((fact) => fact.id === "door_force_opportunity")).toBe(true);
  });

  it("LOOK listen on the room keeps the mechanic facts null", () => {
    const result = resolveDeterministicTurn({
      playerText: "listen to the room",
      previousState: createInitialStateV1(),
      turnIndex: 270,
      mode: "LOOK",
    });
    expect(result.stateDeltas).toHaveLength(0);
    expect(result.mechanicFacts).toBeNull();
  });

  it("LOOK listen discovers a hidden sound source", () => {
    const seededState = createInitialStateV1();
    const world = seededState.world as Record<string, unknown>;
    const worldFlags = (world.flags as Record<string, unknown>) ?? {};
    worldFlags[WORLD_FLAGS.room.soundSourceHidden] = true;
    world.flags = worldFlags;
    const result = resolveDeterministicTurn({
      playerText: "listen to the room",
      previousState: seededState,
      turnIndex: 273,
      mode: "LOOK",
    });
    expect(result.stateDeltas.some(
      (delta) =>
        delta &&
        typeof delta === "object" &&
        (delta as Record<string, unknown>).key === WORLD_FLAGS.room.soundSourceRevealed,
    )).toBe(true);
    expect(result.stateDeltas.some(
      (delta) =>
        delta &&
        typeof delta === "object" &&
        (delta as Record<string, unknown>).key === WORLD_FLAGS.clue.hiddenActivityHeard,
    )).toBe(true);
    expect(result.ledgerAdds.some(
      (entry) =>
        entry &&
        typeof entry === "object" &&
        (entry as Record<string, unknown>).effect === WORLD_FLAGS.clue.hiddenActivityHeard,
    )).toBe(true);
    expect(result.mechanicFacts).toBeDefined();
    const facts = result.mechanicFacts!;
    expect(facts.achieved.some((fact) => fact.id === "room_sound_achieved")).toBe(true);
    expect(facts.world.some((fact) => fact.id === "room_sound_world")).toBe(true);
    expect(facts.opportunities.some((fact) => fact.id === "room_sound_opportunity")).toBe(true);
    expect(facts.world.some((fact) => fact.id === "hidden_activity_world")).toBe(true);
    expect(facts.opportunities.some((fact) => fact.id === "hidden_activity_opportunity")).toBe(true);
  });

  it("LOOK listen again after the sound source is revealed is inert", () => {
    const seededState = createInitialStateV1();
    const world = seededState.world as Record<string, unknown>;
    const worldFlags = (world.flags as Record<string, unknown>) ?? {};
    worldFlags[WORLD_FLAGS.room.soundSourceHidden] = true;
    worldFlags[WORLD_FLAGS.room.soundSourceRevealed] = true;
    world.flags = worldFlags;
    const result = resolveDeterministicTurn({
      playerText: "listen to the room",
      previousState: seededState,
      turnIndex: 274,
      mode: "LOOK",
    });
    expect(result.stateDeltas).toHaveLength(0);
    expect(result.mechanicFacts).toBeNull();
  });

  it("LOOK search the room emits canonical room search facts", () => {
    const result = resolveDeterministicTurn({
      playerText: "search the room",
      previousState: createInitialStateV1(),
      turnIndex: 271,
      mode: "LOOK",
    });
    const roomSearched = result.stateDeltas.some(
      (delta) =>
        delta &&
        typeof delta === "object" &&
        (delta as Record<string, unknown>).op === "flag.set" &&
        (delta as Record<string, unknown>).key === WORLD_FLAGS.room.searched,
    );
    const ledgerFound = result.stateDeltas.some(
      (delta) =>
        delta &&
        typeof delta === "object" &&
        (delta as Record<string, unknown>).op === "flag.set" &&
        (delta as Record<string, unknown>).key === WORLD_FLAGS.clue.ledgerFragmentFound,
    );
    expect(roomSearched).toBe(true);
    expect(ledgerFound).toBe(true);
    expect(result.ledgerAdds.some(
      (entry) =>
        entry &&
        typeof entry === "object" &&
        (entry as Record<string, unknown>).effect === WORLD_FLAGS.clue.ledgerFragmentFound,
    )).toBe(true);
    expect(result.mechanicFacts).toBeDefined();
    const facts = result.mechanicFacts!;
    expect(facts.achieved.some((fact) => fact.id === "room_search_achieved")).toBe(true);
    expect(facts.world.some((fact) => fact.id === "room_search_world")).toBe(true);
    expect(facts.world.some((fact) => fact.id === "ledger_fragment_world")).toBe(true);
    expect(facts.opportunities.some((fact) => fact.id === "room_search_opportunity")).toBe(true);
    expect(facts.opportunities.some((fact) => fact.id === "ledger_fragment_opportunity")).toBe(true);
  });

  it("LOOK search again on the room emits no new deltas", () => {
    const seededState = createInitialStateV1();
    const existingFlags = ((seededState.world as Record<string, unknown>)?.flags as Record<string, unknown>) ?? {};
    existingFlags[WORLD_FLAGS.room.searched] = true;
    existingFlags[WORLD_FLAGS.clue.ledgerFragmentFound] = true;
    const result = resolveDeterministicTurn({
      playerText: "search the room",
      previousState: seededState,
      turnIndex: 272,
      mode: "LOOK",
    });
    expect(result.stateDeltas).toHaveLength(0);
    expect(result.mechanicFacts).toBeNull();
  });

  it("LOOK search container emits container facts", () => {
    const result = resolveDeterministicTurn({
      playerText: "search the container",
      previousState: createInitialStateV1(),
      turnIndex: 275,
      mode: "LOOK",
    });
    expect(result.stateDeltas.some(
      (delta) =>
        delta &&
        typeof delta === "object" &&
        (delta as Record<string, unknown>).key === WORLD_FLAGS.container.searched,
    )).toBe(true);
    expect(result.mechanicFacts).toBeDefined();
    const facts = result.mechanicFacts!;
    expect(facts.achieved.some((fact) => fact.id === "container_search_achieved")).toBe(true);
    expect(facts.world.some((fact) => fact.id === "container_search_world")).toBe(true);
    expect(facts.opportunities.some((fact) => fact.id === "container_search_opportunity")).toBe(true);
  });

  it("LOOK search container again emits nothing", () => {
    const first = resolveDeterministicTurn({
      playerText: "search the container",
      previousState: createInitialStateV1(),
      turnIndex: 275,
      mode: "LOOK",
    });
    const result = resolveDeterministicTurn({
      playerText: "search the container",
      previousState: first.nextState,
      turnIndex: 276,
      mode: "LOOK",
    });
    expect(result.stateDeltas).toHaveLength(0);
    expect(result.mechanicFacts).toBeNull();
  });

  it("LOOK search object emits object facts", () => {
    const result = resolveDeterministicTurn({
      playerText: "search the object",
      previousState: createInitialStateV1(),
      turnIndex: 277,
      mode: "LOOK",
    });
    expect(result.stateDeltas.some(
      (delta) =>
        delta &&
        typeof delta === "object" &&
        (delta as Record<string, unknown>).key === WORLD_FLAGS.object.searched,
    )).toBe(true);
    const facts = result.mechanicFacts!;
    expect(facts.achieved.some((fact) => fact.id === "object_search_achieved")).toBe(true);
    expect(facts.world.some((fact) => fact.id === "object_search_world")).toBe(true);
    expect(facts.opportunities.some((fact) => fact.id === "object_search_opportunity")).toBe(true);
  });

  it("LOOK search fixture emits fixture facts", () => {
    const result = resolveDeterministicTurn({
      playerText: "search the fixture",
      previousState: createInitialStateV1(),
      turnIndex: 278,
      mode: "LOOK",
    });
    expect(result.stateDeltas.some(
      (delta) =>
        delta &&
        typeof delta === "object" &&
        (delta as Record<string, unknown>).key === WORLD_FLAGS.fixture.searched,
    )).toBe(true);
    const facts = result.mechanicFacts!;
    expect(facts.world.some((fact) => fact.id === "fixture_search_world")).toBe(true);
    expect(facts.opportunities.some((fact) => fact.id === "fixture_search_opportunity")).toBe(true);
  });

  it("DO sneak emits noise and reposition flags", () => {
    const result = resolveDeterministicTurn({
      playerText: "sneak through the room",
      previousState: createInitialStateV1(),
      turnIndex: 279,
      mode: "DO",
    });
    expect(result.outcome).toBe("SUCCESS_WITH_COST");
    expect(result.stateDeltas.some(
      (delta) =>
        delta &&
        typeof delta === "object" &&
        (delta as Record<string, unknown>).key === WORLD_FLAGS.status.repositioned,
    )).toBe(true);
    const facts = result.mechanicFacts!;
    expect(facts.costs.some((fact) => fact.id === "noise_cost")).toBe(true);
    expect(facts.turnChanges.some((fact) => fact.id === "position_shift")).toBe(true);
    expect(facts.careNow.some((fact) => fact.id === "noise_care")).toBe(true);
  });

  it("DO hide first time records hidden state without cost", () => {
    const result = resolveDeterministicTurn({
      playerText: "hide in the room",
      previousState: createInitialStateV1(),
      turnIndex: 280,
      mode: "DO",
    });
    expect(result.stateDeltas.some(
      (delta) =>
        delta &&
        typeof delta === "object" &&
        (delta as Record<string, unknown>).key === WORLD_FLAGS.status.hidden,
    )).toBe(true);
    expect(result.stateDeltas.some(
      (delta) =>
        delta &&
        typeof delta === "object" &&
        (delta as Record<string, unknown>).key === WORLD_FLAGS.status.exposed,
    )).toBe(true);
    const facts = result.mechanicFacts!;
    expect(facts.achieved.some((fact) => fact.id === "hide_achieved")).toBe(true);
    expect(facts.world.some((fact) => fact.id === "hide_world")).toBe(true);
    expect(facts.persistent.some((fact) => fact.id === "hide_persistent")).toBe(true);
  });

  it("DO hide with quick qualifier adds cost", () => {
    const result = resolveDeterministicTurn({
      playerText: "quick hide in the room",
      previousState: createInitialStateV1(),
      turnIndex: 281,
      mode: "DO",
    });
    const facts = result.mechanicFacts!;
    expect(facts.costs.some((fact) => fact.id === "noise_cost")).toBe(true);
    expect(facts.careNow.some((fact) => fact.id === "noise_care")).toBe(true);
  });

  it("LOOK sneak does nothing", () => {
    const result = resolveDeterministicTurn({
      playerText: "sneak through the room",
      previousState: createInitialStateV1(),
      turnIndex: 282,
      mode: "LOOK",
    });
    expect(result.stateDeltas).toHaveLength(0);
    expect(result.mechanicFacts).toBeNull();
  });

  it("LOOK hide does nothing", () => {
    const result = resolveDeterministicTurn({
      playerText: "hide in the room",
      previousState: createInitialStateV1(),
      turnIndex: 283,
      mode: "LOOK",
    });
    expect(result.stateDeltas).toHaveLength(0);
    expect(result.mechanicFacts).toBeNull();
  });

  it("repeat DO hide becomes a canonical no-op", () => {
    const first = resolveDeterministicTurn({
      playerText: "hide",
      previousState: createInitialStateV1(),
      turnIndex: 100,
      mode: "DO",
    });
    const second = resolveDeterministicTurn({
      playerText: "hide",
      previousState: first.nextState,
      turnIndex: 101,
      mode: "DO",
    });
    expect(first.stateDeltas.length).toBeGreaterThan(0);
    expect(second.stateDeltas).toHaveLength(0);
    expect(second.ledgerAdds).toHaveLength(0);
    expect(second.mechanicFacts).toBeNull();
    expect(second.outcome).toBe("SUCCESS");
  });

  it("merges pressure threshold consequences before deriving the final outcome", () => {
    const seededState = createInitialStateV1();
    seededState.stats = { noise: 2, alert: 1 } as any;
    const world = seededState.world as Record<string, unknown>;
    world.clocks = {
      ...(world.clocks as Record<string, unknown>),
      [DEFAULT_NOISE_CLOCK_ID]: { value: 2 },
      [DEFAULT_ALERT_CLOCK_ID]: { value: 1 },
    };
    world.flags = {
      ...(world.flags as Record<string, unknown>),
      [WORLD_FLAGS.status.exposed]: true,
    };
    const result = resolveDeterministicTurn({
      playerText: "hide in the room",
      previousState: seededState,
      turnIndex: 200,
      mode: "DO",
    });
    const pressureDelta = result.stateDeltas.find(
      (delta) =>
        delta &&
        typeof delta === "object" &&
        (delta as Record<string, unknown>).op === "flag.set" &&
        (delta as Record<string, unknown>).key === WORLD_FLAGS.guard.alerted,
    );
    const pressureLedger = result.ledgerAdds.find(
      (entry) =>
        entry &&
        typeof entry === "object" &&
        (entry as Record<string, unknown>).effect === "Guard is alerted",
    );

    const searchingDelta = result.stateDeltas.find(
      (delta) =>
        delta &&
        typeof delta === "object" &&
        (delta as Record<string, unknown>).key === WORLD_FLAGS.guard.searching,
    );
    const searchingLedger = result.ledgerAdds.find(
      (entry) =>
        entry &&
        typeof entry === "object" &&
        (entry as Record<string, unknown>).effect === "Guard begins searching",
    );

    expect(pressureDelta).toBeDefined();
    expect(pressureLedger).toBeDefined();
    expect(searchingDelta).toBeDefined();
    expect(searchingLedger).toBeDefined();
    expect(result.outcome).toBe("SUCCESS_WITH_COST");
  });

  it("player is revealed when searching guards meet high noise", () => {
    const seededState = createInitialStateV1();
    seededState.stats = { noise: 3, alert: 2 } as any;
    const world = seededState.world as Record<string, unknown>;
    world.flags = {
      ...(world.flags as Record<string, unknown>),
      [WORLD_FLAGS.guard.alerted]: true,
      [WORLD_FLAGS.guard.searching]: true,
    };
    const result = resolveDeterministicTurn({
      playerText: "hide in the room",
      previousState: seededState,
      turnIndex: 201,
      mode: "DO",
    });
    expect(result.stateDeltas.some(
      (delta) =>
        delta &&
        typeof delta === "object" &&
        (delta as Record<string, unknown>).key === WORLD_FLAGS.player.revealed,
    )).toBe(true);
    expect(result.ledgerAdds.some(
      (entry) =>
        entry &&
        typeof entry === "object" &&
        (entry as Record<string, unknown>).effect === "Player is revealed",
    )).toBe(true);
    expect(result.stateDeltas.some(
      (delta) =>
        delta &&
        typeof delta === "object" &&
        (delta as Record<string, unknown>).key === WORLD_FLAGS.status.exposed,
    )).toBe(true);
  });
});
