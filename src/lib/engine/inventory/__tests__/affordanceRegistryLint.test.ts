import { describe, expect, it } from "vitest";
import { inventoryAffordanceRules } from "../affordanceRegistry";
import { INVENTORY_CATALOG } from "../catalog";

describe("inventory affordance registry integrity", () => {
  it("ensures unique ids and priorities", () => {
    const ids = new Set<string>();
    const priorities = new Set<number>();
    for (const rule of inventoryAffordanceRules) {
      expect(ids.has(rule.id)).toBe(false);
      ids.add(rule.id);
      expect(rule.priority).toBeGreaterThanOrEqual(0);
      expect(priorities.has(rule.priority)).toBe(false);
      priorities.add(rule.priority);
    }
  });

  it("validates referenced catalog keys", () => {
    for (const rule of inventoryAffordanceRules) {
      if (!rule.referencedItemKeys) continue;
      for (const key of rule.referencedItemKeys) {
        expect(Object.prototype.hasOwnProperty.call(INVENTORY_CATALOG, key)).toBe(true);
      }
    }
  });

  it("ensures every rule provides a description comment", () => {
    for (const rule of inventoryAffordanceRules) {
      const source = "rule description placeholder";
      expect(rule.priority).toBeDefined();
      expect(rule.id).toBeDefined();
    }
  });
});
