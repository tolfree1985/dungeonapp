import { buildAdventureStateFromScenario, loadScenarioV1 } from "./adventureFromScenario";

type TxLike = {
  adventure: {
    upsert: (args: any) => Promise<any>;
  };
};

export async function createAdventureFromScenarioId(args: {
  tx: TxLike;
  adventureId: string;
  scenarioId: string;
  ownerId?: string | null;
  seed?: number;
}) {
  const { tx, adventureId, scenarioId, ownerId = null, seed } = args;

  const scenario = loadScenarioV1(scenarioId);
  const { state, openingPrompt } = buildAdventureStateFromScenario(scenario);

  const adv = await tx.adventure.upsert({
    where: { id: adventureId },
    update: {
      // if already exists, keep minimal: do not overwrite state silently
      // (caller can decide if they want overwrite behavior later)
    },
    create: {
      id: adventureId,
      latestTurnIndex: -1,
      seed: seed ?? undefined,
      ownerId,
      state: state as any,
    },
    select: { id: true, state: true },
  });

  return { adventureId: adv.id as string, state: adv.state, openingPrompt, scenarioId };
}
