import { createInitialStateV1 } from "@/lib/game/bootstrap";
import { ENGINE_VERSION } from "@/lib/game/engineVersion";
import type { ReplayCase } from "@/lib/replay/replayTypes";
import { createReplayState } from "./replayStateFactory";

export const ritualFirePressure001: ReplayCase = {
  id: "ritual_fire_pressure_001",
  scenarioHash: "ashen-estate-v1",
  engineVersion: ENGINE_VERSION,
  seed: 12345,
  initialState: createReplayState({
    ...createInitialStateV1(),
  }),
  turns: [
    { mode: "DO", text: "splash oil" },
    { mode: "DO", text: "throw lantern" },
    { mode: "DO", text: "move loudly" },
    { mode: "DO", text: "hide" },
    { mode: "DO", text: "wait" },
  ],
};

export const ritualFirePressure001ExpectedChecksums = {
  fullRun: "012a991cb56392500c646c5b236d2f06b3b3b7a664848156af83c5baec8a1a3f",
  finalState: "2cdf0f70407a77aae6cab509c6c0fe735a025cc11de73b06b9db5305dfe0651e",
};
