import { describe, expect, it } from "vitest";
import { resolveActionEffects } from "../resolveActionEffects";
import type { InventoryContext } from "../inventory/inventoryContext";
import type { ReferencedInventoryItem } from "../inventory/extractReferencedInventoryItems";

const baseInput = {
  mode: "LOOK" as const,
  playerText: "inspect the desk",
  state: null,
};

describe("resolveActionEffects (LOOK)", () => {
  it("emits clue progress with no pressure on success", () => {
    const result = resolveActionEffects({ ...baseInput, outcomeTier: "success" });
    expect(result.stateDeltas.some((delta) => delta.kind === "inventory.add")).toBe(true);
    expect(result.stateDeltas.every((delta) => delta.kind !== "pressure.add")).toBe(true);
    expect(result.tags).toEqual(["action:look"]);
  });

  it("adds suspicion/time cost on success_with_cost", () => {
    const result = resolveActionEffects({ ...baseInput, outcomeTier: "success_with_cost" });
    expect(result.stateDeltas.some((delta) => delta.kind === "pressure.add")).toBe(true);
    expect(result.stateDeltas.some((delta) => (delta as any).domain === "time")).toBe(true);
    expect(result.stateDeltas.some((delta) => (delta as any).domain === "suspicion")).toBe(true);
  });

  it("marks mixed as partial progress with heavy time and suspicion cost", () => {
    const result = resolveActionEffects({ ...baseInput, outcomeTier: "mixed" });
    expect(result.stateDeltas.some((delta) => delta.kind === "flag.set" && (delta as any).key === "observed.partial")).toBe(true);
    expect(result.stateDeltas.some((delta) => (delta as any).domain === "time")).toBe(true);
    expect(result.stateDeltas.some((delta) => (delta as any).domain === "suspicion")).toBe(true);
  });

  it("produces time cost when failure" , () => {
    const result = resolveActionEffects({ ...baseInput, outcomeTier: "failure" });
    expect(result.stateDeltas.every((delta) => delta.kind === "pressure.add")).toBe(true);
    expect(result.stateDeltas.some((delta) => (delta as any).domain === "time")).toBe(true);
  });

  it("falls through when not a LOOK keyword", () => {
    const result = resolveActionEffects({ ...baseInput, playerText: "chat casually", outcomeTier: "success" });
    expect(result.stateDeltas).toEqual([]);
  });
});

describe("resolveActionEffects (DO)", () => {
  const doInput = {
    mode: "DO" as const,
    playerText: "pry open the door",
    state: null,
  };

  it("clears an obstacle on success", () => {
    const result = resolveActionEffects({ ...doInput, outcomeTier: "success" });
    expect(result.stateDeltas.some((delta) => delta.kind === "flag.set" && (delta as any).key === "obstacle.cleared")).toBe(true);
    expect(result.stateDeltas.some((delta) => delta.kind === "pressure.add")).toBe(true);
  });

  it("adds noise/danger on failure", () => {
    const result = resolveActionEffects({ ...doInput, outcomeTier: "failure" });
    expect(result.stateDeltas.every((delta) => delta.kind === "pressure.add")).toBe(true);
    expect(result.stateDeltas.some((delta) => (delta as any).domain === "danger")).toBe(true);
  });

  it("falls back when no DO keyword matches", () => {
    const result = resolveActionEffects({ ...doInput, playerText: "dance close", outcomeTier: "mixed" });
    expect(result.stateDeltas.some((delta) => delta.kind === "flag.set" && (delta as any).key === "obstacle.disturbed")).toBe(true);
    expect(result.stateDeltas.some((delta) => (delta as any).domain === "noise")).toBe(true);
  });

  it("ignites fabric when a lit lantern meets tapestry", () => {
    const lanternItem: ReferencedInventoryItem = {
      key: "iron_lantern",
      name: "Iron Lantern",
      tags: ["light"],
      category: "tool",
      effects: ["enable_low_light_inspection"],
      state: { lit: true },
    };
    const inventoryContext: InventoryContext = {
      carriedItems: [lanternItem],
      referencedItems: [lanternItem],
      capabilities: ["fire_source_available"],
    };
    const result = resolveActionEffects({
      ...doInput,
      playerText: "throw the lantern into the tapestry",
      outcomeTier: "success",
      inventoryContext,
    });
    expect(result.stateDeltas.some((delta) => delta.kind === "flag.set" && (delta as any).key === "scene.fire")).toBe(true);
    expect(result.stateDeltas.some((delta) => delta.kind === "pressure.add" && (delta as any).domain === "danger")).toBe(true);
    expect(result.ledgerAdds.some((entry) => entry.effect === "fabric ignited")).toBe(true);
  });
});

describe("resolveActionEffects (SAY)", () => {
  const sayInput = {
    mode: "SAY" as const,
    playerText: "bluff about the guard",
    state: null,
  };

  it("emits relation gains on success", () => {
    const result = resolveActionEffects({ ...sayInput, outcomeTier: "success" });
    expect(result.stateDeltas.some((delta) => delta.kind === "relation.shift" && (delta as any).amount > 0)).toBe(true);
    expect(result.stateDeltas.some((delta) => delta.kind === "flag.set" && (delta as any).key === "status.compliant")).toBe(true);
  });

  it("adds suspicion on mixed", () => {
    const result = resolveActionEffects({ ...sayInput, outcomeTier: "mixed" });
    expect(result.stateDeltas.some((delta) => delta.kind === "pressure.add" && (delta as any).domain === "suspicion")).toBe(true);
    expect(result.stateDeltas.some((delta) => delta.kind === "flag.set" && (delta as any).key === "status.escalated")).toBe(true);
    expect(result.stateDeltas.some((delta) => delta.kind === "flag.set" && (delta as any).key === "social.partial")).toBe(true);
    expect(result.stateDeltas.some((delta) => delta.kind === "flag.set" && (delta as any).key === "status.compliant")).toBe(false);
  });

  it("falls back when no SAY keyword matches", () => {
    const result = resolveActionEffects({ ...sayInput, playerText: "talk quietly", outcomeTier: "mixed" });
    expect(result.stateDeltas.some((delta) => delta.kind === "flag.set" && (delta as any).key === "social.partial")).toBe(true);
    expect(result.stateDeltas.some((delta) => (delta as any).domain === "suspicion")).toBe(true);
    expect(result.stateDeltas.some((delta) => delta.kind === "flag.set" && (delta as any).key === "status.escalated")).toBe(true);
  });

  it("escalates when failure is a threat", () => {
    const threatInput = { ...sayInput, playerText: "threaten the guard", outcomeTier: "failure" as const };
    const result = resolveActionEffects(threatInput);
    expect(result.stateDeltas.some((delta) => delta.kind === "flag.set" && (delta as any).key === "status.escalated")).toBe(true);
    expect(result.stateDeltas.some((delta) => delta.kind === "flag.set" && (delta as any).key === "status.hostile")).toBe(true);
  });
});
