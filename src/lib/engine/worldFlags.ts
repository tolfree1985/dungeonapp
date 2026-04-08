export const WORLD_FLAGS = {
  door: {
    forced: "door.forced",
    open: "ledger_room_door_open",
    kicked: "door.kicked",
  },
  drawer: {
    pulled: "drawer.pulled",
    open: "drawer.open",
    inspected: "drawer.inspected",
    detailsRevealed: "drawer.details_revealed",
  },
  crate: {
    opened: "crate.opened",
    searched: "crate.searched",
    inspected: "crate.inspected",
    contentsRevealed: "crate.contents_revealed",
    conditionRevealed: "crate.condition_revealed",
    weakened: "crate.weakened",
  },
  room: {
    searched: "room.searched",
    detailsRevealed: "room.details_revealed",
  },
  desk: {
    searched: "desk.searched",
    inspected: "desk.inspected",
    detailsRevealed: "desk.details_revealed",
  },
  cabinet: {
    tipped: "cabinet.tipped",
  },
} as const;

export type WorldFlagKey = (typeof WORLD_FLAGS)[keyof typeof WORLD_FLAGS][keyof (typeof WORLD_FLAGS)[keyof typeof WORLD_FLAGS]];
