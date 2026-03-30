import { beforeEach, describe, expect, test } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { postTurn } from "@/app/api/turn/route";
import { queueSceneArt } from "@/lib/sceneArtRepo";
import type { SceneArtPayload } from "@/lib/sceneArt";

const TEST_ADVENTURE_ID_PREFIX = "scene-art-regression-adventure";
const TEST_SAVE_ID = "scene-art-regression-save";
const TEST_SCENARIO_ID = "scene-art-regression-scenario";
const TEST_USER_ID = "scene-art-regression-user";
const TEST_TIER = "NOMAD";
const SHOULD_RUN_DB_TESTS = Boolean(process.env.DATABASE_URL && process.env.SCENE_ART_TESTS === "1");

const EXPECTED_SCENE_KEY = "dock_office";
const EXPECTED_PROMPT_HASH = "scene-art-regression-prompt-hash";
const EXPECTED_ENGINE_VERSION = "regression-engine";

const payload: SceneArtPayload = {
  sceneKey: "dock_office",
  identity: {
    locationId: null,
    pressureStage: null,
    lightingState: null,
    atmosphereState: null,
    environmentWear: null,
    threatPresence: null,
    frameKind: null,
    shotScale: null,
    subjectFocus: null,
    cameraAngle: null,
    primarySubjectKind: null,
    primarySubjectId: null,
    actorVisible: false,
    primaryActorId: null,
  },
  promptMetadata: {
    latestTurnScene: "You step into the dock office.",
    timeValue: null,
    directorDecision: { emphasis: null, compositionBias: null },
  },
  basePrompt: "dock office, quiet",
  renderPrompt: "dock office, quiet, cinematic",
  stylePreset: "victorian-gothic-cinematic",
  tags: [],
  promptHash: EXPECTED_PROMPT_HASH,
};

let currentAdventureId = "";

async function resetRegressionState() {
  await prisma.turnLease.deleteMany({ where: { userId: TEST_USER_ID } });
  await prisma.turnBudgetHold.deleteMany({ where: { userId: TEST_USER_ID } });
  await prisma.userUsage.deleteMany({ where: { userId: TEST_USER_ID } });
  await prisma.turnEvent.updateMany({ where: { adventureId: { startsWith: TEST_ADVENTURE_ID_PREFIX } }, data: { prevEventId: null } });
  await prisma.turnEvent.deleteMany({ where: { adventureId: { startsWith: TEST_ADVENTURE_ID_PREFIX } } });
  await prisma.turn.deleteMany({ where: { adventureId: { startsWith: TEST_ADVENTURE_ID_PREFIX } } });
  await prisma.adventure.deleteMany({ where: { id: { startsWith: TEST_ADVENTURE_ID_PREFIX } } });
  await prisma.saveTurn.deleteMany({ where: { saveId: TEST_SAVE_ID } });
  await prisma.save.deleteMany({ where: { id: TEST_SAVE_ID } });
  await prisma.scenario.upsert({
    where: { id: TEST_SCENARIO_ID },
    update: {},
    create: {
      id: TEST_SCENARIO_ID,
      title: "scene-art regression scenario",
      summary: "regression fixture",
      contentJson: { type: "empty" },
    },
  });
  await prisma.save.create({
    data: {
      id: TEST_SAVE_ID,
      scenarioId: TEST_SCENARIO_ID,
      nextTurnIndex: 1,
      stateJson: { world: { heat: 0, suspicion: 0 } },
      ledgerJson: [],
    },
  });
  currentAdventureId = `${TEST_ADVENTURE_ID_PREFIX}-${randomUUID()}`;
  await prisma.adventure.create({
    data: { id: currentAdventureId, latestTurnIndex: 0 },
  });
}

async function seedSceneArtFixture() {
  await prisma.sceneArt.upsert({
    where: {
      sceneKey_promptHash: {
        sceneKey: EXPECTED_SCENE_KEY,
        promptHash: EXPECTED_PROMPT_HASH,
      },
    },
    update: {
      status: "queued",
      imageUrl: null,
      generationLeaseUntil: null,
      leaseOwnerId: null,
    },
    create: {
      sceneKey: EXPECTED_SCENE_KEY,
      promptHash: EXPECTED_PROMPT_HASH,
      basePrompt: "dock office, quiet",
      renderPrompt: "dock office, quiet, cinematic",
      engineVersion: EXPECTED_ENGINE_VERSION,
    },
  });

  await prisma.turn.create({
    data: {
      adventureId: currentAdventureId,
      turnIndex: 1,
      playerInput: "look around",
      scene: "dock office",
      resolution: {},
      stateDeltas: [],
      ledgerAdds: [],
      debug: {
        sceneIdentity: {
          sceneKey: EXPECTED_SCENE_KEY,
          promptHash: EXPECTED_PROMPT_HASH,
        },
      },
    },
  });

  await prisma.adventure.update({
    where: { id: currentAdventureId },
    data: { latestTurnIndex: 1 },
  });
}

async function callPostTurn(idempotencyKey: string) {
  const body = {
    adventureId: currentAdventureId,
    playerText: "look around",
    action: "LOOK",
    tags: ["regression"],
    rollTotal: 8,
    tier: TEST_TIER,
    idempotencyKey,
  };
  const req = new Request("http://localhost/api/turn", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const res = await postTurn(req, {
    preflightHold: async (_tx, input) => ({
      monthKey: input.monthKey,
      tier: input.tier,
      holdKey: input.holdKey,
      leaseKey: input.leaseKey,
      inputTokens: input.estInputTokens,
      perTurnMaxOutputTokens: 0,
      reservedTotal: 0,
      holdExpiresAt: new Date(input.now ?? Date.now()),
      leaseExpiresAt: new Date(input.now ?? Date.now()),
      idempotent: false,
    }),
  });
  const json = await res.json();
  return { status: res.status, body: json };
}

(SHOULD_RUN_DB_TESTS ? describe : describe.skip)("scene-art contract regression", () => {
  beforeEach(async () => {
    await resetRegressionState();
    await seedSceneArtFixture();
  });

  test("scene-art identity is deterministic across replay", async () => {
    const idempotencyKey = "scene-art-regression-1";
    const seededRow = await prisma.sceneArt.findUnique({
      where: {
        sceneKey_promptHash: {
          sceneKey: EXPECTED_SCENE_KEY,
          promptHash: EXPECTED_PROMPT_HASH,
        },
      },
    });
    expect(seededRow).toBeTruthy();
    const latestTurn = await prisma.turn.findFirst({
      where: { adventureId: currentAdventureId },
      orderBy: { turnIndex: "desc" },
    });
    expect(latestTurn?.debug).toMatchObject({
      sceneIdentity: {
        sceneKey: EXPECTED_SCENE_KEY,
        promptHash: EXPECTED_PROMPT_HASH,
      },
    });
    const first = await callPostTurn(idempotencyKey);
    expect(first.status).toBe(200);
    const firstBody = first.body;
    expect(firstBody).toHaveProperty("sceneArt");
    expect(firstBody.sceneArt).toBeTruthy();
    expect(firstBody.sceneArt.sceneKey).toBeTruthy();
    expect(firstBody.sceneArt.promptHash).toBeTruthy();
    const second = await callPostTurn(idempotencyKey);
    expect(second.status).toBe(200);
    expect(second.body.sceneArt).toEqual(firstBody.sceneArt);
  });

  test("queueSceneArt is idempotent for the same identity", async () => {
    const first = await queueSceneArt(payload, null, "normal", "full");
    const second = await queueSceneArt(payload, null, "normal", "full");

    expect(first.sceneKey).toBe(second.sceneKey);
    expect(first.promptHash).toBe(second.promptHash);
    expect(first.id).toBe(second.id);
  });

  test("replay uses persisted sceneIdentity, not payload", async () => {
    const seedKey = "scene-art-replay-test";
    const first = await callPostTurn(seedKey);
    const replay = await callPostTurn(seedKey);

    expect(replay.status).toBe(200);
    expect(replay.body.sceneArt.sceneKey).toBe(first.body.sceneArt.sceneKey);
    expect(replay.body.sceneArt.promptHash).toBe(first.body.sceneArt.promptHash);
    expect(replay.body.sceneArt).toEqual(first.body.sceneArt);
  });
});
