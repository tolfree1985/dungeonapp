import { describe, expect, it } from "vitest";
import { createInitialStateV1 } from "@/lib/game/bootstrap";
import { deriveMechanicFacts } from "@/lib/engine/presentation/mechanicFacts";
import { resolveDeterministicTurn } from "@/server/turn/deterministicTurn";

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
    expect(mechanicFacts.achieved.some((fact) => fact.id === "door_force_achieved")).toBe(false);
  });
});
