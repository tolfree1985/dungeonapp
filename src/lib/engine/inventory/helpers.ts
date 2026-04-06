import type {
  InventoryItem,
  InventoryItemState,
} from "../types/inventory";

export function findInventoryItem(
  items: InventoryItem[],
  itemKey: string,
): InventoryItem | null {
  return items.find((item) => item.key === itemKey) ?? null;
}

export function hasInventoryItem(
  items: InventoryItem[],
  itemKey: string,
): boolean {
  return items.some((item) => item.key === itemKey);
}

export function addInventoryItem(
  items: InventoryItem[],
  item: InventoryItem,
): InventoryItem[] {
  if (item.quantity && item.quantity > 1) {
    const existing = items.find((x) => x.key === item.key);
    if (existing) {
      return items.map((x) =>
        x.key === item.key
          ? { ...x, quantity: (x.quantity ?? 1) + item.quantity! }
          : x,
      );
    }
  }
  return [...items, item];
}

export function removeInventoryItem(
  items: InventoryItem[],
  itemKey: string,
): InventoryItem[] {
  return items.filter((item) => item.key !== itemKey);
}

export function patchInventoryItemState(
  items: InventoryItem[],
  itemKey: string,
  patch: Partial<InventoryItemState>,
): InventoryItem[] {
  return items.map((item) =>
    item.key === itemKey
      ? {
          ...item,
          state: {
            ...(item.state ?? {}),
            ...patch,
          },
        }
      : item,
  );
}
