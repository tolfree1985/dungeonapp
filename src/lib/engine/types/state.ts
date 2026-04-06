import type { InventoryItem, WorldPlacement } from "./inventory";

export type CurrentScene = {
  key: string;
  kind: "scenario_start";
  text: string;
  locationKey: string | null;
  timeKey: string | null;
  source: {
    type: "start.scene" | "start.prompt";
  };
};

export type AdventureState = Record<string, unknown> & {
  flags: Record<string, unknown>;
  stats: Record<string, unknown>;
  quests: Record<string, unknown>;
  inventory: {
    items: InventoryItem[];
  };
  worldItems: WorldPlacement[];
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
