import type { GameStateV1 } from "./types";

export const DEFAULT_START_LOCATION = "room_start";
export const DEFAULT_NOISE_CLOCK_ID = "clk_noise";
export const DEFAULT_ALERT_CLOCK_ID = "clk_alert";

export function createInitialStateV1(): GameStateV1 {
  return {
    stateVersion: "v1",

    world: {
      time: 0,
      locationId: DEFAULT_START_LOCATION,
      clocks: {
        [DEFAULT_NOISE_CLOCK_ID]: {
          id: DEFAULT_NOISE_CLOCK_ID,
          name: "Noise",
          value: 0,
          max: 6,
          stakes: "If this fills, something notices you.",
        },
        [DEFAULT_ALERT_CLOCK_ID]: {
          id: DEFAULT_ALERT_CLOCK_ID,
          name: "Alert",
          value: 0,
          max: 6,
          stakes: "Higher alert means you are being actively searched for.",
        },
      },
      flags: {},
    },

    inventory: {},

    map: {
      nodes: {
        room_start: {
          id: "room_start",
          name: "Starting Room",
          exits: ["hallway"],
          tags: ["safe"],
        },
        hallway: {
          id: "hallway",
          name: "Hallway",
          exits: ["room_start"],
          tags: ["unknown"],
        },
      },
    },

    npcs: {},
  };
}
