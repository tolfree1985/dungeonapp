type TxLike = {
  scenario: {
    create: (args: any) => Promise<any>;
    count: (args: any) => Promise<number>;
    findMany: (args: any) => Promise<any[]>;
    findUnique: (args: any) => Promise<any | null>;
  };
};

export type ScenarioVisibility = "PRIVATE" | "PUBLIC";
type ListPageInput = { take?: number; cursor?: string | null };

function ownerScenarioCap(): number {
  const raw = process.env.SCENARIO_MAX_PER_OWNER;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) return 200;
  return Math.floor(parsed);
}

async function assertOwnerScenarioCapacity(tx: TxLike, ownerId: string | null) {
  if (!ownerId) return;
  const cap = ownerScenarioCap();
  const used = await tx.scenario.count({ where: { ownerId } });
  if (used >= cap) {
    const err: any = new Error("SCENARIO_CAP_EXCEEDED");
    err.code = "SCENARIO_CAP_EXCEEDED";
    err.status = 429;
    err.details = { ownerId, cap, used };
    throw err;
  }
}

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

  await assertOwnerScenarioCapacity(tx, ownerId);

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

export async function listPublicScenarios(tx: TxLike, input?: ListPageInput) {
  const { cursor } = input ?? {};
  const take = Math.min(Math.max(input?.take ?? 20, 1), 50);
  return tx.scenario.findMany({
    where: { visibility: "PUBLIC" },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: { id: true, title: true, summary: true, ownerId: true, sourceScenarioId: true, updatedAt: true },
  });
}

export async function listMineScenarios(tx: TxLike, ownerId: string, input?: ListPageInput) {
  const { cursor } = input ?? {};
  const take = Math.min(Math.max(input?.take ?? 20, 1), 50);
  return tx.scenario.findMany({
    where: { ownerId },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
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

  await assertOwnerScenarioCapacity(tx, ownerId);

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
