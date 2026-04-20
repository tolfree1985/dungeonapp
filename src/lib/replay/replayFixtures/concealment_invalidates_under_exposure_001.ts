import { ENGINE_VERSION } from "@/lib/game/engineVersion";
import { WORLD_FLAGS } from "@/lib/engine/worldFlags";
import type { ReplayCase } from "@/lib/replay/replayTypes";
import { createReplayState } from "./replayStateFactory";

export const concealmentInvalidatesUnderExposure001: ReplayCase = {
  id: "concealment_invalidates_under_exposure_001",
  scenarioHash: "ashen-estate-v1",
  engineVersion: ENGINE_VERSION,
  seed: 12345,
  initialState: createReplayState({
    currentScene: {
      key: "hallway",
      kind: "scenario_start",
      text: "Deep shadows cover the hallway",
      locationKey: "hallway",
      timeKey: null,
      source: { type: "start.scene" },
    },
    flags: {
      [WORLD_FLAGS.status.hidden]: true,
    },
    stats: {
      noise: 3,
      suspicion: 0,
      time: 0,
      danger: 0,
      alert: 0,
      heat: 0,
      trust: 0,
      turns: 0,
    },
    opportunityWindow: {
      type: "shadow_hide",
      source: "environment.shadow",
      quality: "clean",
      createdAtTurn: 1,
      consumableOnTurn: 2,
      expiresAtTurn: 4,
      expiresAt: 4,
      conditions: {
        ruleId: "SHADOW_HIDE_OPPORTUNITY",
        invalidatedByFlags: [
          WORLD_FLAGS.status.exposed,
          WORLD_FLAGS.guard.searching,
          WORLD_FLAGS.player.revealed,
        ],
      },
      status: "active",
      createdTurnIndex: 1,
    },
  }),
  turns: [{ mode: "DO", text: "wait" }],
};

export const concealmentInvalidatesUnderExposure001ExpectedChecksums = {
  fullRun: "08dc61bd1925c6cc0d64913b426874ab186bb5ec4e74d14e2c61bf9e3b30a209",
  finalState: "886b449614fc8d9fa6fe378cfdfb98e49eeb1da95d679b80a44eee2587542503",
};
