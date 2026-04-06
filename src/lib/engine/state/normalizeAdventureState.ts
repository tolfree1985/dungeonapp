import type { AdventureState } from "../types/state";
import { getCatalogItem } from "../inventory/catalog";

export function normalizeAdventureState(state: AdventureState): AdventureState {
  return {
    ...state,
    inventory: {
      items: ensureInventoryItem(state.inventory?.items ?? [], "oil_vial"),
    },
    worldItems: state.worldItems ?? [],
  };
}

function ensureInventoryItem(items: InventoryStateItem[] | undefined, key: string) {
  const list = [...(items ?? [])];
  if (!list.some((item) => item.key === key)) {
    const catalogItem = getCatalogItem(key);
    if (catalogItem) {
      list.push(catalogItem);
    }
  }
  return list;
}

type InventoryStateItem = {
  key: string;
};
