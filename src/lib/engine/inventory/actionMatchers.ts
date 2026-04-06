import type { InventoryItem } from "./types/inventory";

export function normalizeActionText(input: string): string {
  return (input ?? "").toLowerCase().trim().replace(/\s+/g, " ");
}

function buildItemAliases(item: Pick<InventoryItem, "key" | "name">): string[] {
  const normalizedName = (item.name ?? "").toLowerCase().trim();
  const normalizedKey = item.key.replace(/_/g, " ");
  const aliases = new Set<string>();
  if (item.key) aliases.add(item.key);
  if (normalizedKey) aliases.add(normalizedKey);
  if (normalizedName) aliases.add(normalizedName);
  if (item.key === "iron_lantern") {
    aliases.add("lantern");
    aliases.add("iron lantern");
  }
  if (item.key === "oil_vial") {
    aliases.add("oil");
    aliases.add("flask of oil");
    aliases.add("vial of oil");
  }
  return [...aliases];
}

export function actionReferencesItem(input: string, item: InventoryItem): boolean {
  const normalized = normalizeActionText(input);
  if (!normalized) return false;
  const aliases = buildItemAliases(item);
  for (const alias of aliases) {
    if (!alias) continue;
    if (normalized.includes(alias)) return true;
  }
  return false;
}

const FLAMMABLE_TARGET_PATTERN = /\b(tapestry|drapes?|curtain|cloth|banner)\b/;

export function referencesFlammableTarget(normalized: string): boolean {
  return FLAMMABLE_TARGET_PATTERN.test(normalized);
}
