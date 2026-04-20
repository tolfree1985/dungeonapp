import { ENGINE_VERSION } from "@/lib/game/engineVersion";
import type { ReplayCase } from "@/lib/replay/replayTypes";
import { createReplayState } from "./replayStateFactory";

export const waitOnlyDrift001: ReplayCase = {
  id: "wait_only_drift_001",
  scenarioHash: "ashen-estate-v1",
  engineVersion: ENGINE_VERSION,
  seed: 12345,
  initialState: createReplayState({
    currentScene: {
      key: "room_start",
      kind: "scenario_start",
      text: "A plain corridor",
      locationKey: "room_start",
      timeKey: null,
      source: { type: "start.scene" },
    },
    stats: {
      noise: 0,
      suspicion: 0,
      time: 0,
      danger: 0,
      alert: 0,
      heat: 0,
      trust: 0,
      turns: 0,
    },
  }),
  turns: [
    { mode: "DO", text: "wait" },
    { mode: "DO", text: "wait" },
    { mode: "DO", text: "wait" },
    { mode: "DO", text: "wait" },
    { mode: "DO", text: "wait" },
    { mode: "DO", text: "wait" },
    { mode: "DO", text: "wait" },
    { mode: "DO", text: "wait" },
  ],
};

export const waitOnlyDrift001ExpectedChecksums = {
  fullRun: "f9cc3f65585e95af3b010f43c6a3e56c091162e110151781f02e83d8bc6084bc",
  finalState: "e5b40a1d24a496451481ce87ebb11153d0ec7f67eb500d79621d5da3921ce868",
};
