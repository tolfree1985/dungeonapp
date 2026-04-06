import { actionReferencesItem } from "./actionMatchers";
import {
  InventoryAffordanceContext,
  InventoryAffordanceRule,
} from "./types/inventoryAffordance";
import {
  emitFlag,
  emitPressure,
  mergeResults,
  requireFlag,
  requireReferencedItem,
} from "./affordanceHelpers";

/**
 * Affordance subsystem contract:
 * 1. Setup rules only write persistent flags (fabric.oiled, crate.weakened) and document that work in ledgers/pressure.
 * 2. Payoff/conditional rules require those flags (and referenced items) and emit escalated effects via helper utilities.
 * 3. Conditional variants outrank fallbacks: the registry sorts by priority and stops after the first match.
 * 4. Presenters read persistent flags but never author them; every rule needs a positive test, a negative case, and an arbitration guard when specialized.
 */

const FLAMMABLE_TERMS = ["tapestry", "drapes", "banner", "fabric"];
const CRATE_TERMS = ["crate", "box", "chest"];
const ROPE_TERMS = ["rope", "cord", "line"];
const OIL_TERMS = ["oil", "vial", "flask", "spills"];
export const CRATE_WEAKENED_FLAG = "crate.weakened";
const OILED_FABRIC_FLAG = "fabric.oiled";

function referencesFlammableTarget(input: string): boolean {
  const text = input.toLowerCase();
  return FLAMMABLE_TERMS.some((term) => text.includes(term));
}

export const inventoryAffordanceRules: InventoryAffordanceRule[] = [
  {
    id: "lit_lantern_ignites_oiled_fabric",
    priority: 25,
    referencedItemKeys: ["iron_lantern"],
    evaluate(ctx) {
      if (ctx.mode !== "DO") return null;
      const flags = (ctx.state as Record<string, unknown>)?.flags as Record<string, unknown> | undefined;
      if (!flags || flags[OILED_FABRIC_FLAG] !== true) return null;
      const lantern = ctx.inventoryContext.carriedItems.find((item) => item.key === "iron_lantern");
      if (!lantern || !lantern.lit) return null;
      const referencesLantern = actionReferencesItem(ctx.input, {
        key: "iron_lantern",
        name: "Iron Lantern",
      });
      const referencesFabric = referencesFlammableTarget(ctx.input);
      if (!referencesLantern || !referencesFabric) return null;
      return {
        matched: true,
        stateDeltas: [
          { kind: "flag.set", key: "scene.fire", value: true },
          {
            kind: "pressure.add",
            domain: "danger",
            amount: 2,
          },
          { kind: "flag.set", key: "scene.fire.accelerant", value: true },
        ],
        ledgerAdds: [
          {
            kind: "state_change",
            cause: "inventory.fire",
            effect: "Oiled fabric ignites violently",
            deltaKind: "flag.set",
          },
        ],
      };
    },
  },
  {
    id: "lit_lantern_ignites_fabric",
    priority: 20,
    referencedItemKeys: ["iron_lantern"],
    evaluate(ctx) {
      if (ctx.mode !== "DO") return null;

      const lantern = ctx.inventoryContext.carriedItems.find((item) => item.key === "iron_lantern");
      if (!lantern) return null;

      const referencesLantern = actionReferencesItem(ctx.input, {
        key: "iron_lantern",
        name: "Iron Lantern",
      });
      const litLanternAvailable = Boolean(lantern.lit);
      const referencesFabric = referencesFlammableTarget(ctx.input);

      if (!referencesLantern || !referencesFabric || !litLanternAvailable) {
        return null;
      }

      return {
        matched: true,
        stateDeltas: [
          { kind: "flag.set", key: "scene.fire", value: true },
          { kind: "pressure.add", domain: "danger", amount: 1 },
        ],
        ledgerAdds: [
          {
            kind: "state_change",
            cause: "inventory.fire",
            effect: "fabric ignited",
            deltaKind: "flag.set",
          },
        ],
      };
    },
  },
  {
    id: "oil_spreads_fire",
    priority: 15,
    referencedItemKeys: ["oil_vial"],
    evaluate(ctx: InventoryAffordanceContext) {
      if (ctx.mode !== "DO") return null;
      const oil = ctx.inventoryContext.carriedItems.find((item) => item.key === "oil_vial");
      if (!oil) return null;
      const referencesOil = actionReferencesItem(ctx.input, { key: "oil_vial", name: "Oil Vial" });
      const referencesFabric = referencesFlammableTarget(ctx.input);
      const mentionsOilTerm = OIL_TERMS.some((term) => ctx.input.toLowerCase().includes(term));
      if (!referencesOil || !referencesFabric) return null;
      return {
        matched: true,
        stateDeltas: [
          { kind: "flag.set", key: "fabric.oiled", value: true },
          { kind: "pressure.add", domain: "time", amount: 1 },
        ],
        ledgerAdds: [
          {
            kind: "state_change",
            cause: "inventory.chemical",
            effect: "Oil spreads across the fabric",
            deltaKind: "flag.set",
          },
        ],
      };
    },
  },
  {
    id: "crate_is_weakened",
    priority: 8,
    referencedItemKeys: ["crowbar"],
    evaluate(ctx: InventoryAffordanceContext) {
      if (ctx.mode !== "DO") return null;
      if (!requireReferencedItem(ctx, "crowbar", ["crowbar"])) return null;
      const text = ctx.input.toLowerCase();
      const verbs = ["weaken", "loosen", "crack", "splinter", "bash"];
      const mentionsCrate = CRATE_TERMS.some((term) => text.includes(term));
      if (!mentionsCrate || !verbs.some((verb) => text.includes(verb))) return null;
      const base = emitFlag(CRATE_WEAKENED_FLAG, true);
      const noise = emitPressure("noise", 1);
      const combined = mergeResults(base, noise);
      return {
        matched: true,
        stateDeltas: combined.stateDeltas,
        ledgerAdds: [
          ...combined.ledgerAdds,
          {
            kind: "state_change",
            cause: "action",
            effect: "Crate weakened for easier prying",
            deltaKind: "flag.set",
          },
        ],
      };
    },
  },
  {
    id: "crowbar_pries_weakened_crate",
    priority: 12,
    referencedItemKeys: ["crowbar"],
    evaluate(ctx: InventoryAffordanceContext) {
      if (ctx.mode !== "DO") return null;
      if (!requireFlag(ctx, CRATE_WEAKENED_FLAG)) return null;
      if (!requireReferencedItem(ctx, "crowbar", ["crowbar"])) return null;
      const referencesCrate = CRATE_TERMS.some((term) => ctx.input.toLowerCase().includes(term));
      if (!referencesCrate) return null;
      const base = emitFlag("container.crate_open", true);
      const noise = emitPressure("noise", 1);
      const danger = emitPressure("danger", 1);
      const combined = mergeResults(base, mergeResults(noise, danger));
      return {
        matched: true,
        stateDeltas: combined.stateDeltas,
        ledgerAdds: [
          ...combined.ledgerAdds,
          {
            kind: "state_change",
            cause: "inventory.tool",
            effect: "Weakened crate yields under the crowbar",
            deltaKind: "flag.set",
          },
        ],
      };
    },
  },
  {
    id: "crowbar_pries_crate",
    priority: 10,
    referencedItemKeys: ["crowbar"],
    evaluate(ctx) {
      if (ctx.mode !== "DO") return null;
      if (!requireReferencedItem(ctx, "crowbar", ["crowbar"])) return null;
      const referencesCrate = CRATE_TERMS.some((term) => ctx.input.toLowerCase().includes(term));
      if (!referencesCrate) return null;
      const base = emitFlag("container.crate_open", true);
      const noise = emitPressure("noise", 1);
      return mergeResults(base, noise);
    },
  },
  {
    id: "rope_anchors_beam",
    priority: 5,
    referencedItemKeys: ["rope"],
    evaluate(ctx: InventoryAffordanceContext) {
      if (ctx.mode !== "DO") return null;
      const rope = ctx.inventoryContext.carriedItems.find((item) => item.key === "rope");
      if (!rope) return null;
      const referencesRope = actionReferencesItem(ctx.input, { key: "rope", name: "Rope" });
      const referencesBeam = ROPE_TERMS.some((term) => ctx.input.toLowerCase().includes("beam") && ctx.input.toLowerCase().includes(term));
      if (!referencesRope || !referencesBeam) return null;
      return {
        matched: true,
        stateDeltas: [{ kind: "flag.set", key: "traversal.anchor_ready", value: true }],
        ledgerAdds: [
          {
            kind: "state_change",
            cause: "inventory.tool",
            effect: "Rope secured to overhead beam",
            deltaKind: "flag.set",
          },
        ],
      };
    },
  },
];

export function evaluateInventoryAffordanceRules(
  ctx: InventoryAffordanceContext,
  rules: InventoryAffordanceRule[] = inventoryAffordanceRules,
): { ruleId: string; priority: number; result: InventoryAffordanceResult } | null {
  const sortedRules = [...rules].sort((a, b) => b.priority - a.priority);
  for (const rule of sortedRules) {
    const result = rule.evaluate(ctx);
    if (result?.matched) {
      return { ruleId: rule.id, priority: rule.priority, result };
    }
  }
  return null;
}

export type AffordanceRegistryLintIssue = {
  level: "warning" | "error";
  message: string;
};

export function runAffordanceRegistryLint(): AffordanceRegistryLintIssue[] {
  const issues: AffordanceRegistryLintIssue[] = [];
  const idMap = new Map<string, InventoryAffordanceRule>();
  const prioritySet = new Set<number>();
  const seenItemKeys = new Set<string>();
  for (const rule of inventoryAffordanceRules) {
    if (idMap.has(rule.id)) {
      issues.push({ level: "error", message: `Duplicate rule id ${rule.id}` });
    }
    idMap.set(rule.id, rule);
    if (prioritySet.has(rule.priority)) {
      issues.push({ level: "warning", message: `Priority ${rule.priority} reused by ${rule.id}` });
    }
    prioritySet.add(rule.priority);
    if (rule.referencedItemKeys) {
      for (const itemKey of rule.referencedItemKeys) {
        if (!seenItemKeys.has(itemKey)) {
          seenItemKeys.add(itemKey);
        }
      }
    }
  }
  return issues;
}
