import { buildAdventureStateFromScenario, loadScenarioV1 } from "./adventureFromScenario";

type TxLike = {
  adventure: {
    findUnique: (args: any) => Promise<any>;
    upsert: (args: any) => Promise<any>;
  };
  turn: {
    create: (args: any) => Promise<any>;
  };
};

export async function createAdventureFromScenarioId(args: {
  tx: TxLike;
  adventureId: string;
  scenarioId: string;
  ownerId?: string | null;
  seed?: number;
  overwrite?: boolean;
}) {
  const { tx, adventureId, scenarioId, ownerId = null, seed } = args;

  const existing = await tx.adventure.findUnique({
    where: { id: adventureId },
    select: { state: true },
  });

  if (existing?.state && !args.overwrite) {
    const existingScenarioId = (existing.state as any)?._meta?.scenarioId;

    if (existingScenarioId && existingScenarioId !== scenarioId) {
      const err: any = new Error("SCENARIO_MISMATCH");
      err.code = "SCENARIO_MISMATCH";
      err.status = 409;
      throw err;
    }

    // idempotent return (no overwrite)
    return {
      adventureId,
      state: existing.state,
      openingPrompt: (existing.state as any)?._meta?.openingPrompt,
      scenarioId: existingScenarioId ?? scenarioId,
    };
  }

  const scenario = loadScenarioV1(scenarioId);
  const { state, openingPrompt } = buildAdventureStateFromScenario(scenario);

  const isFreshCreate = !existing;

  const adv = await tx.adventure.upsert({
    where: { id: adventureId },
    update: args.overwrite
      ? {
          seed: seed ?? undefined,
          ownerId,
          state: state as any,
        }
      : {},
    create: {
      id: adventureId,
      latestTurnIndex: 0,
      seed: seed ?? undefined,
      ownerId,
      state: state as any,
    },
    select: { id: true, state: true },
  });

  if (isFreshCreate) {
    await tx.turn.create({
      data: {
        adventureId: adv.id,
        turnIndex: 0,
        playerInput: "",
        scene: openingPrompt,
        resolution: {},
        stateDeltas: {},
        ledgerAdds: [],
        memoryGate: null,
        debug: null,
        intentJson: null,
      },
    });
  }

  return { adventureId: adv.id as string, state: adv.state, openingPrompt, scenarioId };
}
