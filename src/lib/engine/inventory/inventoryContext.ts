import type { AdventureState } from "../types/state";
import type { InventoryItem } from "../types/inventory";
import { extractReferencedInventoryItems, type ReferencedInventoryItem } from "./extractReferencedInventoryItems";

export type InventoryAffordance = "fire_source_available" | "lubricant_available" | "proof_available";

export type InventoryContext = {
  carriedItems: ReferencedInventoryItem[];
  referencedItems: ReferencedInventoryItem[];
  capabilities: InventoryAffordance[];
};

function deriveItemLit(item: any): boolean {
  if (!item || typeof item !== "object") return false;
  if (item.state?.lit === true) return true;
  if (item.lit === true) return true;
  if (Array.isArray(item.effects) && item.effects.includes("lit")) return true;
  if (Array.isArray(item.tags) && item.tags.includes("lit")) return true;
  return false;
}

function normalizeInventoryItem(item: InventoryItem): ReferencedInventoryItem {
  const lit = deriveItemLit(item);
  return {
    key: item.key,
    name: item.name,
    tags: item.tags ?? [],
    category: item.category,
    effects: item.effects ?? [],
    state: {
      ...(item.state ?? {}),
      lit,
    },
  };
}

export function buildInventoryContext(
  text: string,
  state: AdventureState,
): InventoryContext {
  const referencedItems = extractReferencedInventoryItems(text, state);
  const carriedItems: ReferencedInventoryItem[] = (state.inventory?.items ?? [])
    .map((item) => normalizeInventoryItem(item as InventoryItem));
  const capabilities = new Set<InventoryAffordance>();
  const lanternReferenced = referencedItems.some((item) => item.key === "iron_lantern");
  const lanternCarriedLit = carriedItems.some((item) => item.key === "iron_lantern" && item.state?.lit === true);
  if (lanternCarriedLit && lanternReferenced) {
    capabilities.add("fire_source_available");
  }
  if (referencedItems.some((item) => item.key === "lock_grease")) {
    capabilities.add("lubricant_available");
  }
  if (referencedItems.some((item) => item.key === "wax_seal_fragment")) {
    capabilities.add("proof_available");
  }
  console.log("inventory.context.debug", {
    carriedItems: carriedItems.map((item) => ({
      key: item.key,
      lit: item.state?.lit ?? null,
      capabilities: [],
    })),
    referencedItems: referencedItems.map((item) => item.key),
    capabilities: Array.from(capabilities),
  });
  return {
    carriedItems,
    referencedItems,
    capabilities: Array.from(capabilities),
  };
}
