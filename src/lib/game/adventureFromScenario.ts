type ScenarioContent = {
  initialState?: Record<string, unknown>;
  start?: {
    prompt?: string | null;
    scene?: string | Record<string, unknown> | null;
    sceneId?: string | null;
    locationKey?: string | null;
    timeKey?: string | null;
  };
  title?: string;
  summary?: string;
};

type CurrentScene = {
  key: string;
  kind: "scenario_start";
  text: string;
  locationKey: string | null;
  timeKey: string | null;
  source: {
    type: "start.scene" | "start.prompt";
  };
};

type AdventureState = Record<string, unknown> & {
  flags: Record<string, unknown>;
  stats: Record<string, unknown>;
  quests: Record<string, unknown>;
  inventory: unknown[];
  relationships: Record<string, unknown>;
  memory: unknown[];
  currentScene: CurrentScene | null;
  _meta: {
    openingPrompt: string | null;
    locationKey: string | null;
    timeKey: string | null;
    [key: string]: unknown;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function stableHash(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function deterministicSceneKeyFromStart(text: string, source: "start.scene" | "start.prompt"): string {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, " ");
  return `bootstrap:${source}:${stableHash(normalized)}`;
}

function firstNonEmptyString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return "";
}

export function buildAdventureStateFromScenario(input: ScenarioContent | { content?: ScenarioContent }): AdventureState {
  const scenario: ScenarioContent =
    input && typeof input === "object" && "content" in input && input.content
      ? input.content
      : (input as ScenarioContent);

  console.log("BUILD STATE INPUT", JSON.stringify(scenario, null, 2));

  const initial = isRecord(scenario.initialState) ? structuredClone(scenario.initialState) : {};
  const start = isRecord(scenario.start) ? scenario.start : {};

  const prompt =
    typeof start.prompt === "string" && start.prompt.trim().length > 0 ? start.prompt.trim() : "";

  const rawScene = start.scene;

  let text = "";
  let sourceType: "start.scene" | "start.prompt" = "start.prompt";

  if (typeof rawScene === "string" && rawScene.trim().length > 0) {
    text = rawScene.trim();
    sourceType = "start.scene";
  } else if (isRecord(rawScene)) {
    text = firstNonEmptyString(rawScene.text, rawScene.prompt, rawScene.description, rawScene.narration, rawScene.body);
    if (text) {
      sourceType = "start.scene";
    }
  }

  if (!text && prompt) {
    text = prompt;
    sourceType = "start.prompt";
  }

  const locationKey =
    typeof start.locationKey === "string" && start.locationKey.trim().length > 0
      ? start.locationKey.trim()
      : null;

  const timeKey =
    typeof start.timeKey === "string" && start.timeKey.trim().length > 0 ? start.timeKey.trim() : null;

  const explicitSceneId =
    typeof start.sceneId === "string" && start.sceneId.trim().length > 0 ? start.sceneId.trim() : null;

  const currentScene: CurrentScene | null = text
    ? {
        key: explicitSceneId ?? deterministicSceneKeyFromStart(text, sourceType),
        kind: "scenario_start",
        text,
        locationKey,
        timeKey,
        source: {
          type: sourceType,
        },
      }
    : null;

  const state: AdventureState = {
    ...initial,
    flags: isRecord(initial.flags) ? initial.flags : {},
    stats: isRecord(initial.stats) ? initial.stats : {},
    quests: isRecord(initial.quests) ? initial.quests : {},
    inventory: Array.isArray(initial.inventory) ? initial.inventory : [],
    relationships: isRecord(initial.relationships) ? initial.relationships : {},
    memory: Array.isArray(initial.memory) ? initial.memory : [],
    currentScene,
    _meta: {
      ...(isRecord(initial._meta) ? initial._meta : {}),
      openingPrompt: text || null,
      locationKey,
      timeKey,
    },
  };

  return state;
}
