type ScenarioTemplate = {
  key: string;
  label: string;
  scenario: Record<string, unknown>;
};

const BASELINE_SCENARIO: Record<string, unknown> = {
  version: "1",
  id: "deterministic-baseline",
  title: "Deterministic Baseline",
  summary: "Minimal deterministic scenario scaffold.",
  initialState: {
    stats: {
      heat: 0,
      trust: 1,
    },
    inventory: [],
    relationships: {},
    quests: {},
    flags: {},
    memory: [],
  },
  start: {
    sceneId: "scene_start",
    prompt: "You take a breath and begin.",
  },
  turns: [],
};

export const SCENARIO_TEMPLATE_LIBRARY: ScenarioTemplate[] = [
  {
    key: "mystery_investigation_seed",
    label: "Mystery Investigation Seed",
    scenario: {
      version: "1",
      id: "mystery-investigation-seed",
      title: "Mystery Investigation Seed",
      summary: "Investigate missing ledgers and escalating suspicion.",
      initialState: {
        stats: {
          heat: 0,
          trust: 2,
        },
        inventory: [],
        relationships: {
          watchCaptain: "wary",
        },
        quests: {},
        flags: {
          toneLock: "locked",
          genreLock: "locked",
          pacingLock: "locked",
        },
        memory: [],
      },
      start: {
        sceneId: "dock_office",
        prompt: "You arrive at dawn to inspect the missing harbor ledgers.",
      },
      turns: [
        {
          turnIndex: 0,
          stateDeltas: [
            { path: "stats.heat", op: "set", value: 1 },
            { path: "relationships.watchCaptain", op: "set", value: "suspicious" },
          ],
          ledgerAdds: [
            { message: "The captain demands answers.", kind: "social", refTurnIndex: 0 },
            { message: "Attention rises at the docks.", kind: "pressure", refTurnIndex: 0 },
          ],
        },
      ],
    },
  },
  {
    key: "political_intrigue_seed",
    label: "Political Intrigue Seed",
    scenario: {
      version: "1",
      id: "political-intrigue-seed",
      title: "Political Intrigue Seed",
      summary: "Balance factions while protecting fragile alliances.",
      initialState: {
        stats: {
          influence: 3,
          suspicion: 0,
        },
        inventory: [],
        relationships: {
          council: "neutral",
        },
        quests: {},
        flags: {
          toneLock: "locked",
          genreLock: "locked",
          pacingLock: "locked",
        },
        memory: [],
      },
      start: {
        sceneId: "council_chamber",
        prompt: "The council convenes and every faction watches your first move.",
      },
      turns: [
        {
          turnIndex: 0,
          stateDeltas: [
            { path: "relationships.council", op: "set", value: "tense" },
            { path: "stats.suspicion", op: "set", value: 1 },
          ],
          ledgerAdds: [
            { message: "A rival faction questions your loyalty.", kind: "political", refTurnIndex: 0 },
            { message: "The chamber mood shifts to tense.", kind: "social", refTurnIndex: 0 },
          ],
        },
      ],
    },
  },
  {
    key: "dungeon_expedition_seed",
    label: "Dungeon Expedition Seed",
    scenario: {
      version: "1",
      id: "dungeon-expedition-seed",
      title: "Dungeon Expedition Seed",
      summary: "Lead an expedition into unstable ruins.",
      initialState: {
        stats: {
          stamina: 4,
          danger: 0,
        },
        inventory: ["torch"],
        relationships: {},
        quests: {
          expedition: "active",
        },
        flags: {
          toneLock: "locked",
          genreLock: "locked",
          pacingLock: "locked",
        },
        memory: [],
      },
      start: {
        sceneId: "ruin_gate",
        prompt: "The ruin gate opens and your crew waits for your command.",
      },
      turns: [
        {
          turnIndex: 0,
          stateDeltas: [
            { path: "inventory", op: "set", value: ["torch", "rope"] },
            { path: "stats.danger", op: "set", value: 1 },
          ],
          ledgerAdds: [
            { message: "You secure extra rope before descent.", kind: "resource", refTurnIndex: 0 },
            { message: "The ruins feel unstable beneath your feet.", kind: "threat", refTurnIndex: 0 },
          ],
        },
      ],
    },
  },
];

export const DETERMINISTIC_BASELINE_SCENARIO = BASELINE_SCENARIO;
