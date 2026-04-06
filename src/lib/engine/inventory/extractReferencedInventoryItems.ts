import type { AdventureState } from "../types/state";
import type { InventoryItem } from "../types/inventory";
import { actionReferencesItem } from "./actionMatchers";

export type ReferencedInventoryItem = {
  key: string;
  name: string;
  tags: string[];
  category: InventoryItem["category"];
  effects: InventoryItem["effects"];
  state: InventoryItem["state"];
};

export function extractReferencedInventoryItems(
  text: string,
  state: AdventureState,
): ReferencedInventoryItem[] {
  const items = state.inventory?.items ?? [];

  return items
    .filter((item) => actionReferencesItem(text, item))
    .map((item) => ({
      key: item.key,
      name: item.name,
      tags: item.tags ?? [],
      category: item.category,
      effects: item.effects ?? [],
      state: item.state ?? {},
    }));
}
