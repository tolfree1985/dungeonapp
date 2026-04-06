export type InventoryItemCategory =
  | "tool"
  | "evidence"
  | "resource"
  | "burden";

export type InventoryItemState = {
  charges?: number;
  durability?: number;
  lit?: boolean;
  concealed?: boolean;
  bloodied?: boolean;
  sealed?: boolean;
};

export type InventoryItemEffect =
  | "enable_low_light_inspection"
  | "reduce_noise_on_forced_entry"
  | "proof_archives_access"
  | "increase_search_risk"
  | "increase_clerical_attention";

export type InventoryItem = {
  id: string;
  key: string;
  name: string;
  category: InventoryItemCategory;
  tags: string[];
  quantity?: number;
  state?: InventoryItemState;
  effects?: InventoryItemEffect[];
  description?: string;
};

export type WorldPlacement = {
  itemKey: string;
  locationKey: string;
  containerKey?: string | null;
  concealed?: boolean;
};

export type InventoryDelta =
  | { type: "inventory.add"; item: InventoryItem }
  | { type: "inventory.remove"; itemKey: string }
  | {
      type: "inventory.state";
      itemKey: string;
      patch: Partial<InventoryItemState>;
    }
  | {
      type: "inventory.transfer_to_world";
      placement: WorldPlacement;
    };
