import type { InventoryItem } from "../types/inventory";

export const INVENTORY_CATALOG: Record<string, InventoryItem> = {
  iron_lantern: {
    id: "item_iron_lantern",
    key: "iron_lantern",
    name: "Iron Lantern",
    category: "tool",
    tags: ["light", "inspection", "portable"],
    state: {
      lit: false,
      charges: 3,
    },
    effects: ["enable_low_light_inspection"],
    description: "Can be lit for better inspection in darkness.",
  },
  wax_seal_fragment: {
    id: "item_wax_seal_fragment",
    key: "wax_seal_fragment",
    name: "Wax Seal Fragment",
    category: "evidence",
    tags: ["proof", "archives"],
    effects: ["proof_archives_access"],
    description: "Proof tied to restricted archives access.",
  },
  lock_grease: {
    id: "item_lock_grease",
    key: "lock_grease",
    name: "Lock Grease",
    category: "resource",
    tags: ["stealth", "entry"],
    quantity: 1,
    effects: ["reduce_noise_on_forced_entry"],
    description: "Can reduce noise during forced entry.",
  },
  stolen_reliquary: {
    id: "item_stolen_reliquary",
    key: "stolen_reliquary",
    name: "Stolen Reliquary",
    category: "burden",
    tags: ["holy", "valuable", "incriminating"],
    state: {
      concealed: false,
    },
    effects: ["increase_search_risk", "increase_clerical_attention"],
    description: "Valuable, but dangerous to carry openly.",
  },
  oil_vial: {
    id: "item_oil_vial",
    key: "oil_vial",
    name: "Oil Vial",
    category: "resource",
    tags: ["fuel", "chemical"],
    description: "A small vial of oil perfect for igniting fabrics.",
  },
};

export function getCatalogItem(itemKey: string): InventoryItem | null {
  const item = INVENTORY_CATALOG[itemKey];
  if (!item) return null;

  return {
    ...item,
    tags: [...item.tags],
    state: item.state ? { ...item.state } : undefined,
    effects: item.effects ? [...item.effects] : undefined,
  };
}
