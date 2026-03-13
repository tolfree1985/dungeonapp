export type PlayTurn = {
  id: string;
  turnIndex: number;
  playerInput: string;
  scene: string;
  resolution: string;
  stateDeltas: unknown[];
  ledgerAdds: unknown[];
  createdAt: string;
  resolutionJson?: unknown;
};

export type PlayStateValue = string | number | boolean | null;

export type PlayScenarioMeta = {
  id: string;
  title: string;
  summary?: string | null;
};

export type PlayStatePanel = {
  pressureStage?: string | null;
  stats: Array<{ key: string; value: PlayStateValue }>;
  inventory: Array<{ name: string; detail?: string }>;
  quests: Array<{ title: string; status?: string; detail?: string }>;
  relationships: Array<{ name: string; status?: string; detail?: string }>;
  location?: string;
  timeOfDay?: string;
  ambience?: string;
  contextTags?: string[];
};
