import { buildAdventureStateFromScenario } from "./adventureFromScenario";
import type { ScenarioV1 } from "@/lib/scenario/scenarioValidator";
import { normalizeScenarioContent } from "@/lib/scenario/scenarioValidator";

type TxLike = {
  adventure: {
    findUnique: (args: any) => Promise<any>;
    upsert: (args: any) => Promise<any>;
  };
  turn: {
    create: (args: any) => Promise<any>;
  };
  scenario: {
    findUnique: (args: any) => Promise<{ id: string; contentJson: unknown } | null>;
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

  if (process.env.NODE_ENV === "development") {
    console.log("CREATE ADVENTURE INPUT", {
      ownerId,
      scenarioId,
      adventureId,
    });
  }

  const existing = await tx.adventure.findUnique({
    where: { id: adventureId },
    select: { state: true, ownerId: true },
  });

  if (existing?.ownerId && ownerId && existing.ownerId !== ownerId) {
    const err: any = new Error("ADVENTURE_FORBIDDEN");
    err.code = "ADVENTURE_FORBIDDEN";
    err.status = 403;
    throw err;
  }

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

  const scenario = await loadScenarioFromDb(tx, scenarioId);
  console.log(
    "BOOTSTRAP SCENARIO CONTENT",
    JSON.stringify(
      {
        scenarioId,
        title: scenario.title ?? null,
        slug: (scenario as any).slug ?? null,
        content: scenario,
      },
      null,
      2,
    ),
  );
  const initialState = buildAdventureStateFromScenario(scenario);
  const openingPrompt = initialState._meta?.openingPrompt ?? null;

  if (!initialState.currentScene?.key || !initialState.currentScene?.text) {
    throw new Error("Bootstrap failed: missing currentScene");
  }

  if (process.env.NODE_ENV === "development") {
    console.log("BOOTSTRAP INITIAL STATE", {
      currentScene: initialState.currentScene,
      meta: initialState._meta,
    });
    console.log("FINAL STATE BEFORE WRITE", JSON.stringify(initialState, null, 2));
  }

  const isFreshCreate = !existing;

  const adv = await tx.adventure.upsert({
    where: { id: adventureId },
    update: args.overwrite
      ? {
          seed: seed ?? undefined,
          ownerId,
          state: initialState as any,
        }
      : {},
    create: {
      id: adventureId,
      latestTurnIndex: 0,
      seed: seed ?? undefined,
      ownerId,
      state: initialState as any,
    },
    select: { id: true, state: true },
  });

  if (isFreshCreate) {
    await tx.turn.create({
      data: {
        adventureId: adv.id,
        turnIndex: 0,
        playerInput: "",
        scene: initialState.currentScene?.text ?? openingPrompt ?? "",
        resolution: {},
        stateDeltas: {},
        ledgerAdds: [],
        memoryGate: null,
        debug: null,
        intentJson: null,
      },
    });

    if (process.env.NODE_ENV === "development") {
      console.log("CREATE ADVENTURE TURN 0", {
        adventureId: adv.id,
        turnIndex: 0,
        scene: openingPrompt,
      });
    }
  }

  if (process.env.NODE_ENV === "development") {
    console.log("CREATE ADVENTURE RESULT", {
      adventureId: adv.id,
      ownerId,
      latestTurnIndex: isFreshCreate ? 0 : null,
    });
  }

  return { adventureId: adv.id as string, state: adv.state, openingPrompt, scenarioId };
}

async function loadScenarioFromDb(tx: TxLike, scenarioId: string) {
  const row = await tx.scenario.findUnique({
    where: { id: scenarioId },
    select: { id: true, contentJson: true },
  });

  if (!row) {
    const err: any = new Error(`Scenario not found: ${scenarioId}`);
    err.code = "SCENARIO_NOT_FOUND";
    err.status = 404;
    throw err;
  }

  return normalizeScenarioContent(row.contentJson, row.id);
}
