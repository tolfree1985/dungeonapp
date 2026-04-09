export type InteractionVerb =
  | "search"
  | "inspect"
  | "force"
  | "open"
  | "kick"
  | "pull"
  | "move"
  | "tip"
  | "ignite"
  | "pry"
  | "weaken";

export type InteractionTargetType =
  | "door"
  | "crate"
  | "desk"
  | "drawer"
  | "cabinet"
  | "chair"
  | "room"
  | "container"
  | "barrier";

export type ResolvedInteraction = {
  mode: "DO" | "SAY" | "LOOK";
  verb: InteractionVerb | null;
  targetId?: string | null;
  targetType?: InteractionTargetType | null;
  rawInput: string;
  normalizedInput: string;
  matchesForcedDoorPhrase: boolean;
};

export type CanonicalStateDelta =
  | { kind: "flag.set"; op: "flag.set"; key: string; value: boolean; label?: string; detail?: string }
  | { kind: "stat.inc"; op: "stat.inc"; stat: "noise" | "danger" | "time" | "suspicion"; amount: number }
  | { kind: "tag.add"; op: "tag.add"; key: string; value: string };

export type LedgerEntry = {
  cause: string;
  effect: string;
  detail: string;
};

export type InteractionMutationResult = {
  stateDeltas: CanonicalStateDelta[];
  ledgerAdds: LedgerEntry[];
};

export type AdventureState = Record<string, unknown>;

type InteractionHandler = (interaction: ResolvedInteraction, state: AdventureState) => InteractionMutationResult;

const VERB_PATTERNS: Record<InteractionVerb, string[]> = {
  search: ["search", "scan"],
  inspect: ["inspect", "examine", "read"],
  force: ["force", "pry"],
  open: ["open", "slide"],
  kick: ["kick"],
  pull: ["pull", "drag"],
  move: ["move"],
  tip: ["tip", "topple", "knock over"],
  ignite: ["ignite", "light", "burn"],
  pry: ["pry"],
  weaken: ["weaken", "damage"],
};

const TARGET_PATTERNS: Record<InteractionTargetType, string[]> = {
  door: ["door", "entrance", "portal", "threshold"],
  crate: ["crate", "box", "chest"],
  desk: ["desk", "writing desk"],
  drawer: ["drawer", "compartment"],
  cabinet: ["cabinet", "shelf"],
  chair: ["chair"],
  room: ["room", "chamber", "hall"],
  container: ["container", "case"],
  barrier: ["barrier", "shield", "wall"],
};

const FORCE_DOOR_PATTERNS = [
  "force the door open",
  "force door open",
  "force the ledger room door open",
  "force open the door",
  "force the ledger room door",
];

const interactionHandlers: Record<string, InteractionHandler> = {
  "force:door": resolveForceDoor,
  "kick:door": resolveKickDoor,
  "inspect:door": resolveInspectDoor,
  "inspect:ledger_room_door": resolveInspectDoor,
  "search:room": resolveSearchRoom,
  "inspect:crate": resolveInspectCrate,
  "search:crate": resolveSearchCrate,
  "pull:drawer": resolvePullDrawer,
  "search:desk": resolveSearchDesk,
  "tip:cabinet": resolveTipCabinet,
  "move:chair": resolveMoveChair,
};

export function matchesForcedDoorPhrase(normalizedInput: string): boolean {
  return FORCE_DOOR_PATTERNS.some((pattern) => normalizedInput.includes(pattern));
}

export function isForcedDoorAction(normalizedMode: string, normalizedInput: string): boolean {
  return normalizedMode === "DO" && matchesForcedDoorPhrase(normalizedInput);
}

export function classifyInteraction(
  normalizedInput: string,
  normalizedMode: string,
  state: AdventureState,
): ResolvedInteraction {
  const verb = detectVerb(normalizedInput);
  const targetType = detectTarget(normalizedInput);
  const matchesForcedDoor = matchesForcedDoorPhrase(normalizedInput);
  if (matchesForcedDoor && normalizedMode !== "DO") {
    console.error(
      "door.force.mode_mismatch",
      JSON.stringify(
        {
          normalizedInput,
          normalizedMode,
        },
        null,
        2,
      ),
    );
  }
  const targetId = detectTargetId(normalizedInput);
  return {
    mode: normalizedMode === "DO" ? "DO" : normalizedMode === "SAY" ? "SAY" : "LOOK",
    verb,
    targetId,
    targetType,
    rawInput: normalizedInput,
    normalizedInput,
    matchesForcedDoorPhrase: matchesForcedDoor,
  };
}

export function resolveInteractionMutation(
  interaction: ResolvedInteraction,
  state: AdventureState,
): InteractionMutationResult {
  if (interaction.mode === "SAY" || !interaction.verb || !interaction.targetType) {
    console.log("interaction.dispatch.key", {
      mode: interaction.mode,
      verb: interaction.verb,
      targetType: interaction.targetType,
    });
    return { stateDeltas: [], ledgerAdds: [] };
  }
  const key = `${interaction.verb}:${interaction.targetType}`;
  console.log("interaction.dispatch.key", {
    mode: interaction.mode,
    verb: interaction.verb,
    targetType: interaction.targetType,
    lookupKey: key,
  });
  const handler = interactionHandlers[key];
  if (!handler) {
    console.log("interaction.handler.result", {
      key,
      hasResult: false,
    });
    return { stateDeltas: [], ledgerAdds: [] };
  }
  const result = handler(interaction, state);
  console.log("interaction.handler.result", {
    key,
    hasResult: Boolean(result),
    resultKeys: result ? Object.keys(result) : [],
    stateDeltaCount: result?.stateDeltas?.length ?? 0,
    ledgerCount: result?.ledgerAdds?.length ?? 0,
  });
  return result;
}

function detectVerb(normalizedInput: string): InteractionVerb | null {
  for (const [verb, patterns] of Object.entries(VERB_PATTERNS) as [InteractionVerb, string[]][]) {
    if (patterns.some((pattern) => normalizedInput.includes(pattern))) {
      return verb;
    }
  }
  return null;
}

function detectTarget(normalizedInput: string): InteractionTargetType | null {
  for (const [target, patterns] of Object.entries(TARGET_PATTERNS) as [InteractionTargetType, string[]][]) {
    if (patterns.some((pattern) => normalizedInput.includes(pattern))) {
      return target;
    }
  }
  return null;
}

function detectTargetId(normalizedInput: string): string | null {
  if (normalizedInput.includes("ledger room door")) return "ledger_room_door";
  if (normalizedInput.includes("writing desk")) return "writing_desk";
  return null;
}

function resolveForceDoor(): InteractionMutationResult {
  return {
    stateDeltas: [
      {
        kind: "flag.set",
        op: "flag.set",
        key: "door.forced",
        value: true,
        label: "Door",
        detail: "You force the door open.",
      },
      {
        kind: "flag.set",
        op: "flag.set",
        key: "ledger_room_door_open",
        value: true,
        label: "Door",
        detail: "The ledger room door yawns open.",
      },
    ],
    ledgerAdds: [
      {
        cause: "state_change",
        effect: "Door forced open",
        detail: "The ledger room door is now open.",
      },
    ],
  };
}

function resolveKickDoor(state: AdventureState): InteractionMutationResult {
  const worldFlags = getWorldFlags(state);
  if (worldFlags["door.kicked"]) {
    return { stateDeltas: [], ledgerAdds: [] };
  }
  return {
    stateDeltas: [createFlagDelta("door.kicked", "Door", "The door flexes under the impact and the frame groans.")],
    ledgerAdds: [],
  };
}

function resolveSearchRoom(state: AdventureState): InteractionMutationResult {
  const worldFlags = getWorldFlags(state);
  const deltas: CanonicalStateDelta[] = [];
  if (!worldFlags["room.searched"]) {
    deltas.push(createFlagDelta("room.searched", "Search", "The room is swept for clues and the dust patterns shift."));
  }
  return { stateDeltas: deltas, ledgerAdds: [] };
}

function resolveInspectCrate(state: AdventureState): InteractionMutationResult {
  const worldFlags = getWorldFlags(state);
  if (worldFlags["crate.inspected"]) return { stateDeltas: [], ledgerAdds: [] };
  return {
    stateDeltas: [createFlagDelta("crate.inspected", "Object", "You study the crate and find a weak seam to exploit.")],
    ledgerAdds: [],
  };
}

function resolveSearchCrate(state: AdventureState): InteractionMutationResult {
  const worldFlags = getWorldFlags(state);
  if (worldFlags["crate.searched"]) return { stateDeltas: [], ledgerAdds: [] };
  return {
    stateDeltas: [createFlagDelta("crate.searched", "Object", "The open crate yields something useful now that you look inside.")],
    ledgerAdds: [],
  };
}

function resolveSearchDesk(state: AdventureState): InteractionMutationResult {
  const worldFlags = getWorldFlags(state);
  if (worldFlags["desk.searched"]) return { stateDeltas: [], ledgerAdds: [] };
  return {
    stateDeltas: [createFlagDelta("desk.searched", "Search", "You comb through the desk, scattering papers and revealing seams.")],
    ledgerAdds: [],
  };
}

function resolvePullDrawer(state: AdventureState): InteractionMutationResult {
  const worldFlags = getWorldFlags(state);
  if (worldFlags["drawer.pulled"]) return { stateDeltas: [], ledgerAdds: [] };
  return {
    stateDeltas: [createFlagDelta("drawer.pulled", "Object", "The drawer slides out, showing a hidden recess.")],
    ledgerAdds: [],
  };
}

function resolveTipCabinet(state: AdventureState): InteractionMutationResult {
  const worldFlags = getWorldFlags(state);
  if (worldFlags["cabinet.tipped"]) return { stateDeltas: [], ledgerAdds: [] };
  return {
    stateDeltas: [createFlagDelta("cabinet.tipped", "Object", "The cabinet tips and its contents spill onto the floor.")],
    ledgerAdds: [],
  };
}

function resolveMoveChair(state: AdventureState): InteractionMutationResult {
  const worldFlags = getWorldFlags(state);
  if (worldFlags["chair.moved"]) return { stateDeltas: [], ledgerAdds: [] };
  return {
    stateDeltas: [createFlagDelta("chair.moved", "Object", "The chair is dragged aside, and the floor beneath it is exposed.")],
    ledgerAdds: [],
  };
}

function resolveInspectDoor(_state: AdventureState): InteractionMutationResult {
  const deltas: CanonicalStateDelta[] = [
    createFlagDelta("action.door.inspect", "Action", "You inspect the door closely."),
    createFlagDelta("door.inspected", "Door", "You study the door and gather relevant details."),
    createFlagDelta("door.condition_revealed", "Door", "The door’s condition is now understood."),
  ];
  console.log(
    "door.inspect.contract",
    JSON.stringify(
      {
        stateDeltaOps: deltas.map((delta) => delta.op),
        stateDeltaKeys: deltas
          .filter((delta) => delta.op === "flag.set")
          .map((delta) => (delta as Record<string, unknown>).key ?? null),
        ledgerCount: 1,
      },
      null,
      2,
    ),
  );
  return {
    stateDeltas: deltas,
    ledgerAdds: [
      {
        cause: "door.inspect",
        effect: "door.condition_revealed",
        detail: "Inspecting the door reveals its condition and structural details.",
      },
    ],
  };
}

function getWorldFlags(state: AdventureState): Record<string, unknown> {
  const world = (state.world as Record<string, unknown>) ?? {};
  return (world.flags as Record<string, unknown>) ?? {};
}

function createFlagDelta(key: string, label: string, detail: string): CanonicalStateDelta {
  return {
    kind: "flag.set",
    op: "flag.set",
    key,
    value: true,
    label,
    detail,
  };
}
