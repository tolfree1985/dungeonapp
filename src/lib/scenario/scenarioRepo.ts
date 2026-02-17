type TxLike = {
  scenario: {
    create: (args: any) => Promise<any>;
    findMany: (args: any) => Promise<any[]>;
    findUnique: (args: any) => Promise<any | null>;
  };
};

export type ScenarioVisibility = "PRIVATE" | "PUBLIC";

export async function createScenario(
  tx: TxLike,
  input: {
    id: string;
    title: string;
    summary?: string | null;
    contentJson: unknown;
    visibility?: ScenarioVisibility;
    ownerId?: string | null;
    sourceScenarioId?: string | null;
  },
) {
  const {
    id,
    title,
    summary = null,
    contentJson,
    visibility = "PRIVATE",
    ownerId = null,
    sourceScenarioId = null,
  } = input;

  return tx.scenario.create({
    data: {
      id,
      title,
      summary,
      contentJson: contentJson as any,
      visibility,
      ownerId,
      sourceScenarioId,
    },
    select: { id: true, visibility: true, ownerId: true, sourceScenarioId: true, title: true },
  });
}

export async function listPublicScenarios(tx: TxLike) {
  return tx.scenario.findMany({
    where: { visibility: "PUBLIC" },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, summary: true, ownerId: true, sourceScenarioId: true, updatedAt: true },
  });
}

export async function listMineScenarios(tx: TxLike, ownerId: string) {
  return tx.scenario.findMany({
    where: { ownerId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, summary: true, ownerId: true, sourceScenarioId: true, updatedAt: true },
  });
}

export async function forkScenario(
  tx: TxLike,
  input: {
    sourceScenarioId: string;
    newId: string;
    ownerId?: string | null;
  },
) {
  const { sourceScenarioId, newId, ownerId = null } = input;

  const src = await tx.scenario.findUnique({
    where: { id: sourceScenarioId },
    select: { id: true, title: true, summary: true, contentJson: true },
  });

  if (!src) {
    const err: any = new Error("SCENARIO_NOT_FOUND");
    err.code = "SCENARIO_NOT_FOUND";
    err.status = 404;
    throw err;
  }

  return tx.scenario.create({
    data: {
      id: newId,
      title: src.title,
      summary: src.summary,
      contentJson: src.contentJson as any,
      visibility: "PRIVATE",
      ownerId,
      sourceScenarioId: src.id,
    },
    select: { id: true, visibility: true, ownerId: true, sourceScenarioId: true, title: true },
  });
}
