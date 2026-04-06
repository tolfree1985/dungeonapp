import { describe, expect, it } from "vitest";
import { CRATE_WEAKENED_FLAG, evaluateInventoryAffordanceRules, inventoryAffordanceRules } from "../affordanceRegistry";
import type { InventoryAffordanceRule } from "../types/inventoryAffordance";

describe("inventoryAffordanceRules", () => {
  it("activates the lantern ignition rule", () => {
    const rule = inventoryAffordanceRules.find((entry) => entry.id === "lit_lantern_ignites_fabric");
    expect(rule).toBeDefined();
    if (!rule) return;

    const result = rule.evaluate({
      mode: "DO",
      input: "throw the lantern into the tapestry",
      inventoryContext: {
        carriedItems: [{ key: "iron_lantern", lit: true, capabilities: [] }],
        referencedItems: ["iron_lantern"],
        capabilities: [],
      },
      state: null,
    });
    expect(result).not.toBeNull();
    expect(result?.matched).toBe(true);
    expect(result?.stateDeltas.some((delta) => delta.kind === "flag.set" && delta.key === "scene.fire")).toBe(true);
    expect(result?.stateDeltas.some((delta) => delta.kind === "pressure.add" && delta.domain === "danger")).toBe(true);
    expect(result?.ledgerAdds.length).toBeGreaterThan(0);
  });

  it("activates the crowbar rule", () => {
    const rule = inventoryAffordanceRules.find((entry) => entry.id === "crowbar_pries_crate");
    expect(rule).toBeDefined();
    if (!rule) return;

    const result = rule.evaluate({
      mode: "DO",
      input: "pry the crate open with the crowbar",
      inventoryContext: {
        carriedItems: [{ key: "crowbar", lit: false, capabilities: [] }],
        referencedItems: ["crowbar"],
        capabilities: [],
      },
      state: null,
    });
    expect(result?.matched).toBe(true);
    expect(result?.stateDeltas.some((delta) => delta.kind === "flag.set" && delta.key === "container.crate_open")).toBe(true);
    expect(result?.stateDeltas.some((delta) => delta.kind === "pressure.add" && delta.domain === "noise")).toBe(true);
    expect(result?.ledgerAdds.some((entry) => (entry as any).effect?.includes("Crowbar pried"))).toBe(true);
  });

  it("anchors rope to beam when told", () => {
    const rule = inventoryAffordanceRules.find((entry) => entry.id === "rope_anchors_beam");
    expect(rule).toBeDefined();
    if (!rule) return;

    const result = rule.evaluate({
      mode: "DO",
      input: "tie the rope to the beam",
      inventoryContext: {
        carriedItems: [{ key: "rope", lit: false, capabilities: [] }],
        referencedItems: ["rope"],
        capabilities: [],
      },
      state: null,
    });
    expect(result?.matched).toBe(true);
    expect(result?.stateDeltas.some((delta) => delta.kind === "flag.set" && delta.key === "traversal.anchor_ready")).toBe(true);
    expect(result?.ledgerAdds.some((entry) => (entry as any).effect?.includes("Rope secured"))).toBe(true);
  });

  it("does not anchor rope when beam missing", () => {
    const rule = inventoryAffordanceRules.find((entry) => entry.id === "rope_anchors_beam");
    expect(rule).toBeDefined();
    if (!rule) return;

    const result = rule.evaluate({
      mode: "DO",
      input: "tie the rope to the table",
      inventoryContext: {
        carriedItems: [{ key: "rope", lit: false, capabilities: [] }],
        referencedItems: ["rope"],
        capabilities: [],
      },
      state: null,
    });
    expect(result?.matched).not.toBe(true);
  });

  it("does not trigger electrified fire without target", () => {
    const rule = inventoryAffordanceRules.find((entry) => entry.id === "lit_lantern_ignites_fabric");
    expect(rule).toBeDefined();
    if (!rule) return;

    const result = rule.evaluate({
      mode: "DO",
      input: "set down the lantern gently",
      inventoryContext: {
        carriedItems: [{ key: "iron_lantern", lit: true, capabilities: [] }],
        referencedItems: [],
        capabilities: [],
      },
      state: null,
    });
    expect(result?.matched).not.toBe(true);
  });

  it("prefers oiled-fabric ignition when fabric is oiled", () => {
    const rule = inventoryAffordanceRules.find((entry) => entry.id === "lit_lantern_ignites_oiled_fabric");
    expect(rule).toBeDefined();
    if (!rule) return;
    const result = rule.evaluate({
      mode: "DO",
      input: "throw the lit lantern into the tapestry",
      inventoryContext: {
        carriedItems: [{ key: "iron_lantern", lit: true, capabilities: [] }],
        referencedItems: ["iron_lantern"],
        capabilities: [],
      },
      state: { flags: { "fabric.oiled": true } },
    });
    expect(result?.matched).toBe(true);
    expect(result?.stateDeltas.some((delta) => delta.kind === "flag.set" && delta.key === "scene.fire.accelerant")).toBe(true);
  });

  it("prefers weakened crate prying when the crate was pre-weakened", () => {
    const rule = inventoryAffordanceRules.find((entry) => entry.id === "crowbar_pries_weakened_crate");
    expect(rule).toBeDefined();
    if (!rule) return;
    const result = rule.evaluate({
      mode: "DO",
      input: "pry the crate open with the crowbar",
      inventoryContext: {
        carriedItems: [{ key: "crowbar", lit: false, capabilities: [] }],
        referencedItems: ["crowbar"],
        capabilities: [],
      },
      state: { flags: { [CRATE_WEAKENED_FLAG]: true } },
    });
    expect(result?.matched).toBe(true);
    expect(result?.stateDeltas.some((delta) => delta.kind === "flag.set" && delta.key === "container.crate_open")).toBe(true);
  });

  it("falls back to the standard crowbar rule when crate is not weakened", () => {
    const rule = inventoryAffordanceRules.find((entry) => entry.id === "crowbar_pries_crate");
    expect(rule).toBeDefined();
    if (!rule) return;
    const result = rule.evaluate({
      mode: "DO",
      input: "pry the crate open with the crowbar",
      inventoryContext: {
        carriedItems: [{ key: "crowbar", lit: false, capabilities: [] }],
        referencedItems: ["crowbar"],
        capabilities: [],
      },
      state: { flags: { [CRATE_WEAKENED_FLAG]: false } },
    });
    expect(result?.matched).toBe(true);
    expect(result?.stateDeltas.some((delta) => delta.kind === "flag.set" && delta.key === "container.crate_open")).toBe(true);
  });

  it("enables crate weakening before crowbar payoff", () => {
    const setupRule = inventoryAffordanceRules.find((entry) => entry.id === "crate_is_weakened");
    const payoffRule = inventoryAffordanceRules.find((entry) => entry.id === "crowbar_pries_weakened_crate");
    expect(setupRule).toBeDefined();
    expect(payoffRule).toBeDefined();
    if (!setupRule || !payoffRule) return;
    const setup = setupRule.evaluate({
      mode: "DO",
      input: "loosen the crate corner with the crowbar",
      inventoryContext: {
        carriedItems: [{ key: "crowbar", lit: false, capabilities: [] }],
        referencedItems: ["crowbar"],
        capabilities: [],
      },
      state: { flags: {} },
    });
    expect(setup?.matched).toBe(true);
    const payoff = payoffRule.evaluate({
      mode: "DO",
      input: "pry open the crate",
      inventoryContext: {
        carriedItems: [{ key: "crowbar", lit: false, capabilities: [] }],
        referencedItems: ["crowbar"],
        capabilities: [],
      },
      state: { flags: { [CRATE_WEAKENED_FLAG]: true } },
    });
    expect(payoff?.matched).toBe(true);
  });

  it("integration seam: weaken then pry uses weakened rule", () => {
    const setupRule = inventoryAffordanceRules.find((entry) => entry.id === "crate_is_weakened");
    const payoffRule = inventoryAffordanceRules.find((entry) => entry.id === "crowbar_pries_crate");
    expect(setupRule).toBeDefined();
    expect(payoffRule).toBeDefined();
    if (!setupRule || !payoffRule) return;
    const setup = setupRule.evaluate({
      mode: "DO",
      input: "weaken the crate with a few strikes",
      inventoryContext: {
        carriedItems: [{ key: "crowbar", lit: false, capabilities: [] }],
        referencedItems: ["crowbar"],
        capabilities: [],
      },
      state: { flags: {} },
    });
    expect(setup?.matched).toBe(true);
    const payoff = payoffRule.evaluate({
      mode: "DO",
      input: "pry open the crate",
      inventoryContext: {
        carriedItems: [{ key: "crowbar", lit: false, capabilities: [] }],
        referencedItems: ["crowbar"],
        capabilities: [],
      },
      state: { flags: { [CRATE_WEAKENED_FLAG]: true } },
    });
    expect(payoff?.matched).toBe(true);
    expect(payoff?.stateDeltas.some((delta) => delta.key === "container.crate_open")).toBe(true);
  });

  it("honors rule priority", () => {
    const highRule: InventoryAffordanceRule = {
      id: "high",
      priority: 10,
      evaluate(ctx) {
        if (!ctx.input.includes("priority")) return null;
        return {
          matched: true,
          stateDeltas: [{ kind: "flag.set", key: "priority.high", value: true }],
          ledgerAdds: [{ kind: "state_change", cause: "priority", effect: "high", deltaKind: "flag.set" }],
        };
      },
    };
    const lowRule: InventoryAffordanceRule = {
      id: "low",
      priority: 5,
      evaluate: highRule.evaluate,
    };
    const context = {
      mode: "DO" as const,
      input: "test priority",
      inventoryContext: {
        carriedItems: [],
        referencedItems: [],
        capabilities: [],
      },
      state: null,
    };
    const match = evaluateInventoryAffordanceRules(context, [lowRule, highRule]);
    expect(match?.ruleId).toBe("high");
    expect(match?.result.stateDeltas.some((delta) => (delta as any).key === "priority.high")).toBe(true);
  });
});
