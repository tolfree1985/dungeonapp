export const WORLD_FLAGS = {
  door: {
    forced: "door.forced",
    open: "ledger_room_door_open",
    openAttempted: "door.open_attempted",
    kicked: "door.kicked",
    inspected: "door.inspected",
    conditionRevealed: "door.condition_revealed",
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
    soundSourceHidden: "room.sound_source_hidden",
    soundSourceRevealed: "room.sound_source_revealed",
  },
  desk: {
    searched: "desk.searched",
    inspected: "desk.inspected",
    detailsRevealed: "desk.details_revealed",
  },
  cabinet: {
    tipped: "cabinet.tipped",
  },
  clue: {
    ledgerFragmentFound: "clue.ledger_fragment_found",
    hiddenActivityHeard: "clue.hidden_activity_heard",
  },
  container: {
    searched: "container.searched",
    detailsRevealed: "container.details_revealed",
  },
  object: {
    searched: "object.searched",
    detailsRevealed: "object.details_revealed",
  },
  fixture: {
    searched: "fixture.searched",
    detailsRevealed: "fixture.details_revealed",
  },
  guard: {
    alerted: "guard.alerted",
    searching: "guard.searching",
  },
  player: {
    revealed: "player.revealed",
  },
  status: {
    hidden: "status.hidden",
    exposed: "status.exposed",
    repositioned: "status.repositioned",
    covered: "status.covered",
    pressureExposed: "status.pressure_exposed",
  },
  pressure: {
    actionConstraint: "action.constraint_pressure",
  },
} as const;

export type WorldFlagKey = (typeof WORLD_FLAGS)[keyof typeof WORLD_FLAGS][keyof (typeof WORLD_FLAGS)[keyof typeof WORLD_FLAGS]];

const FLAG_NORMALIZATION: Record<string, WorldFlagKey> = {
  guard_alerted: WORLD_FLAGS.guard.alerted,
  guard_searching: WORLD_FLAGS.guard.searching,
  player_revealed: WORLD_FLAGS.player.revealed,
  status_exposed: WORLD_FLAGS.status.exposed,
  status_pressure_exposed: WORLD_FLAGS.status.pressureExposed,
};

export function normalizeFlagKey(key: string): string {
  return FLAG_NORMALIZATION[key] ?? key;
}
