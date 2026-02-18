export type StateVersion = "v1";

/** Core world clock */
export type Clock = {
  id: string;
  name: string;
  value: number;
  max: number;
  stakes?: string;
};

/** Inventory item */
export type InventoryItem = {
  id: string;
  name: string;
  qty?: number;
  tags?: string[];
};

/** Location graph node */
export type LocationNode = {
  id: string;
  name: string;
  exits: string[];
  tags?: string[];
};

/** NPC minimal structure (expand later safely) */
export type NPC = {
  id: string;
  name: string;
  flags?: Record<string, boolean>;
};

/** Canonical Game State v1 */
export type GameStateV1 = {
  stateVersion: StateVersion;

  world: {
    time: number;
    locationId: string;

    clocks: Record<string, Clock>;
    flags: Record<string, boolean>;
  };

  inventory: Record<string, InventoryItem>;

  map: {
    nodes: Record<string, LocationNode>;
  };

  npcs: Record<string, NPC>;
};
