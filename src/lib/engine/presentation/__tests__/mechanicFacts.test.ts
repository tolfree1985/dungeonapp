import { describe, expect, it } from "vitest";
import { WORLD_FLAGS } from "@/lib/engine/worldFlags";
import { deriveMechanicFacts } from "../mechanicFacts";
import { FACT_TEXT, getCanonicalFactText } from "../factTextRegistry";
import type { PendingReaction } from "@/lib/engine/reactions/types";

describe("mechanicFacts opportunity derivation", () => {
  it("turns an active shadow hide window into readable player-facing facts", () => {
    const facts = deriveMechanicFacts({
      stateFlags: {},
      stateDeltas: [],
      ledgerAdds: [],
      stats: {},
      opportunityWindow: {
        type: "shadow_hide",
        source: "environment.shadow",
        quality: "clean",
        createdAtTurn: 3,
        consumableOnTurn: 4,
        expiresAtTurn: 4,
        expiresAt: 12,
        conditions: { ruleId: "SHADOW_HIDE_OPPORTUNITY" },
        status: "active",
        createdTurnIndex: 3,
      },
    });

    expect(facts).not.toBeNull();
    expect(facts?.opportunities.map((line) => line.text)).toEqual(
      expect.arrayContaining([
        "Strike from cover",
        "Strike from cover.",
        "Strong advantage",
        "Consumed on use",
        "Lost if you wait",
      ]),
    );
  });

  it("renders a reduced strength for contested windows", () => {
    const facts = deriveMechanicFacts({
      stateFlags: {},
      stateDeltas: [],
      ledgerAdds: [],
      stats: {},
      opportunityWindow: {
        type: "shadow_hide",
        source: "environment.shadow",
        quality: "contested",
        createdAtTurn: 3,
        consumableOnTurn: 4,
        expiresAtTurn: 4,
        expiresAt: 12,
        conditions: { ruleId: "SHADOW_HIDE_OPPORTUNITY" },
        status: "active",
        createdTurnIndex: 3,
      },
    });

    expect(facts?.opportunities.map((line) => line.text)).toEqual(
      expect.arrayContaining(["Reduced advantage"]),
    );
  });

  it("extracts a readable opportunity from ledger evidence even without a live window", () => {
    const facts = deriveMechanicFacts({
      stateFlags: {},
      stateDeltas: [],
      ledgerAdds: [
        {
          kind: "opportunity.window",
          cause: "opportunity.created",
          effect: "opportunity.window-created",
          detail: "A shadow_hide opportunity becomes available.",
          data: {
            window: {
              type: "shadow_hide",
              createdTurn: 3,
              expiresAt: 4,
              source: "environment.shadow",
              quality: "clean",
              status: "active",
            },
          },
        },
      ],
      stats: {},
      currentTurnIndex: 3,
    });

    expect(facts?.opportunityFacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Strike from cover",
          description: "Strike from cover.",
          availability: "now",
          strength: "strong",
          source: "ledger",
        }),
      ]),
    );
    expect(facts?.opportunities.map((line) => line.text)).toEqual(
      expect.arrayContaining([
        "Strike from cover",
        "Strike from cover.",
        "Strong advantage",
        "Consumed on use",
        "Lost if you wait",
      ]),
    );
  });

  it("deduplicates a single opportunity window across state and duplicate ledger evidence", () => {
    const facts = deriveMechanicFacts({
      stateFlags: {},
      stateDeltas: [],
      ledgerAdds: [
        {
          kind: "opportunity.window",
          cause: "opportunity.created",
          effect: "opportunity.window-created",
          detail: "A shadow_hide opportunity becomes available.",
          data: {
            window: {
              type: "shadow_hide",
              createdTurn: 3,
              expiresAt: 4,
              source: "environment.shadow",
              quality: "clean",
              status: "active",
            },
          },
        },
        {
          kind: "opportunity.window",
          cause: "opportunity.created",
          effect: "opportunity.window-created",
          detail: "A shadow_hide opportunity becomes available.",
          data: {
            window: {
              type: "shadow_hide",
              createdTurn: 3,
              expiresAt: 4,
              source: "environment.shadow",
              quality: "clean",
              status: "active",
            },
          },
        },
      ],
      stats: {},
      opportunityWindow: {
        type: "shadow_hide",
        source: "environment.shadow",
        quality: "clean",
        createdAtTurn: 3,
        consumableOnTurn: 4,
        expiresAtTurn: 4,
        expiresAt: 4,
        conditions: { ruleId: "SHADOW_HIDE_OPPORTUNITY" },
        status: "active",
        createdTurnIndex: 3,
      },
      currentTurnIndex: 3,
    });

    expect(facts?.opportunityFacts).toHaveLength(1);
    expect(facts?.opportunityFacts?.[0]).toEqual(
      expect.objectContaining({
        id: "shadow_hide:3",
        label: "Strike from cover",
        source: "state",
      }),
    );
    expect(facts?.opportunities.filter((line) => line.text === "Strike from cover")).toHaveLength(1);
  });

  it("projects persistent fire hazard state without replaying a turn change", () => {
    const facts = deriveMechanicFacts({
      stateFlags: {
        environmentHazards: {
          fire: {
            targetKey: "surface",
            status: "burning",
            createdTurnIndex: 20,
            ignitionTurnIndex: 21,
            intensity: 2,
            fuel: 2,
          },
        },
      },
      stateDeltas: [],
      ledgerAdds: [],
      stats: {},
      currentTurnIndex: 22,
    });

    expect(facts.world.map((fact) => fact.text)).toEqual(
      expect.arrayContaining(["Fire is burning."]),
    );
    expect(facts.careNow.map((fact) => fact.text)).toEqual(
      expect.arrayContaining(["Flames are spreading."]),
    );
    expect(facts.turnChanges.map((fact) => fact.text)).toEqual([
      "No measurable change occurred this turn.",
    ]);
  });

  it("derives the last turn ledger from the current turn's causal entries", () => {
    const facts = deriveMechanicFacts({
      stateFlags: {},
      stateDeltas: [],
      ledgerAdds: [
        { effect: "Crate opened" },
        { effect: "Noise +1" },
        { effect: "Guard alertness +1" },
      ],
      stats: {},
      currentTurnIndex: 7,
    });

    expect(facts.lastTurnConsequences?.map((entry) => entry.text)).toEqual([
      "The crate was opened.",
      "The crate opens this turn.",
      "Crate opened from ledger.",
    ]);
  });

  it("renders only one canonical world fact for an oiled fire state", () => {
    const facts = deriveMechanicFacts({
      stateFlags: {
        environmentHazards: {
          fire: {
            targetKey: "surface",
            status: "oiled",
            createdTurnIndex: 20,
            ignitionTurnIndex: null,
            intensity: 0,
            fuel: 3,
          },
        },
      },
      stateDeltas: [],
      ledgerAdds: [],
      stats: {},
      currentTurnIndex: 20,
    });

    expect(facts.world.map((fact) => fact.text)).toEqual(["Oil coats the floor."]);
    expect(facts.persistent).toHaveLength(0);
    expect(facts.careNow.map((fact) => fact.text)).toEqual(
      expect.arrayContaining(["Oil coats the floor."]),
    );
  });

  it("does not re-emit fire or oil achievements from persistent state alone", () => {
    const facts = deriveMechanicFacts({
      stateFlags: {
        environmentHazards: {
          fire: {
            targetKey: "surface",
            status: "burning",
            createdTurnIndex: 20,
            ignitionTurnIndex: 21,
            intensity: 2,
            fuel: 2,
          },
        },
      },
      stateDeltas: [],
      ledgerAdds: [],
      stats: {},
      currentTurnIndex: 22,
    });

    expect(facts.achieved.map((fact) => fact.text)).not.toEqual(
      expect.arrayContaining(["You spread the oil.", "You ignited the oil."]),
    );
    expect(facts.world.map((fact) => fact.text)).toEqual(
      expect.arrayContaining(["Fire is burning."]),
    );
  });

  it("renders burned out fire canonically and drops active-fire care now", () => {
    const facts = deriveMechanicFacts({
      stateFlags: {
        environmentHazards: {
          fire: {
            targetKey: "surface",
            status: "burned_out",
            createdTurnIndex: 20,
            ignitionTurnIndex: 21,
            intensity: 0,
            fuel: 0,
          },
        },
      },
      stateDeltas: [],
      ledgerAdds: [],
      stats: {},
      currentTurnIndex: 23,
    });

    expect(facts.world.map((fact) => fact.text)).toEqual(
      expect.arrayContaining(["Fire is out."]),
    );
    expect(facts.turnChanges.map((fact) => fact.text)).not.toContain("Fire went out.");
    expect(facts.careNow.map((fact) => fact.text)).not.toContain("Flames are spreading.");
  });

  it("suppresses the ignitable oil opportunity once fire is burning", () => {
    const facts = deriveMechanicFacts({
      stateFlags: {
        environmentHazards: {
          fire: {
            targetKey: "surface",
            status: "burning",
            createdTurnIndex: 20,
            ignitionTurnIndex: 21,
            intensity: 2,
            fuel: 2,
          },
        },
      },
      stateDeltas: [],
      ledgerAdds: [],
      stats: {},
      currentTurnIndex: 22,
    });

    expect(facts.opportunities.map((fact) => fact.text)).not.toContain("Ignite the oil.");
  });

  it("does not surface a concealment opportunity when the state is exposed and searched", () => {
    const facts = deriveMechanicFacts({
      stateFlags: {
        guard_searching: true,
        guard_alerted: true,
        status_exposed: true,
      },
      stateDeltas: [],
      ledgerAdds: [
        {
          kind: "opportunity.window",
          cause: "opportunity.created",
          effect: "opportunity.window-created",
          detail: "A shadow_hide opportunity becomes available.",
          data: {
            window: {
              type: "shadow_hide",
              createdTurn: 3,
              expiresAt: 4,
              source: "environment.shadow",
              quality: "clean",
              status: "active",
            },
          },
        },
      ],
      stats: {
        alert: 3,
        noise: 18,
        danger: 16,
      },
      opportunityWindow: {
        type: "shadow_hide",
        source: "environment.shadow",
        quality: "clean",
        createdAtTurn: 3,
        consumableOnTurn: 4,
        expiresAtTurn: 4,
        expiresAt: 4,
        conditions: { ruleId: "SHADOW_HIDE_OPPORTUNITY" },
        status: "active",
        createdTurnIndex: 3,
      },
      currentTurnIndex: 4,
    });

    expect(facts.opportunityFacts ?? []).toHaveLength(0);
    expect(facts.opportunities.map((fact) => fact.text)).not.toContain("Strike from cover");
  });

  it("treats exposure as canonical when hidden and exposed flags both exist", () => {
    const facts = deriveMechanicFacts({
      stateFlags: {
        [WORLD_FLAGS.status.hidden]: true,
        [WORLD_FLAGS.status.exposed]: true,
        [WORLD_FLAGS.player.revealed]: true,
      },
      stateDeltas: [],
      ledgerAdds: [],
      stats: {},
      currentTurnIndex: 24,
    });

    expect(facts.world.map((fact) => fact.text)).not.toContain("You remain hidden.");
    expect(facts.careNow.map((fact) => fact.text)).toContain("Your position is exposed.");
    expect(facts.opportunities.map((fact) => fact.text)).not.toContain("Strike from cover");
  });

  it("canonicalizes overlapping alert, exposure, and fire care facts by semantic key", () => {
    const facts = deriveMechanicFacts({
      stateFlags: {
        guard_alerted: true,
        guard_searching: true,
        status_exposed: true,
        environmentHazards: {
          fire: {
            targetKey: "surface",
            status: "burning",
            createdTurnIndex: 20,
            ignitionTurnIndex: 21,
            intensity: 2,
            fuel: 2,
          },
        },
      },
      stateDeltas: [
        { kind: "pressure.add", domain: "danger", amount: 1 },
        { kind: "pressure.add", domain: "noise", amount: 1 },
      ],
      ledgerAdds: [
        {
          kind: "environment.hazard",
          cause: "fire.spread",
          effect: "Fire is burning.",
        },
        {
          kind: "environment.hazard",
          cause: "npc.alert",
          effect: "Enemies are watching for noise.",
        },
      ],
      stats: {
        alert: 2,
        noise: 18,
        danger: 18,
      },
      currentTurnIndex: 22,
    });

    const careKeys = facts.careNow.map((fact) => fact.key ?? fact.id);
    expect(new Set(careKeys).size).toBe(careKeys.length);
    expect(careKeys).toEqual(
      expect.arrayContaining(["alert_state", "exposure_risk", "fire_active"]),
    );
  });

  it("surfaces alert and exposure costs in turn changes", () => {
    const facts = deriveMechanicFacts({
      stateFlags: {
        guard_alerted: true,
        status_exposed: true,
      },
      stateDeltas: [
        { op: "clock.inc", id: "clk_alert", by: 1 },
        { op: "clock.inc", id: "clk_noise", by: 1 },
        { kind: "flag.set", key: "status_exposed", value: true },
      ],
      ledgerAdds: [],
      stats: {
        alert: 2,
        noise: 16,
      },
      currentTurnIndex: 22,
    });

    expect(facts.turnChanges.map((fact) => fact.text)).toEqual(
      expect.arrayContaining(["Alertness rose.", "Position exposed."]),
    );
  });

  it("derives a world fact when careNow exists but world would otherwise be empty", () => {
    const facts = deriveMechanicFacts({
      stateFlags: {},
      stateDeltas: [],
      ledgerAdds: [],
      stats: {
        alert: 2,
      },
      currentTurnIndex: 12,
    });

    expect(facts.careNow.length).toBeGreaterThan(0);
    expect(facts.world.length).toBeGreaterThan(0);
    expect(facts.world.map((fact) => fact.text)).toContain("Guards are alert.");
  });

  it("emits at most one careNow fact per canonical key", () => {
    const facts = deriveMechanicFacts({
      stateFlags: {
        guard_alerted: true,
        guard_searching: true,
        status_exposed: true,
      },
      stateDeltas: [],
      ledgerAdds: [],
      stats: {
        alert: 2,
      },
      pendingReactions: [
        {
          kind: "investigation",
          resolved: false,
        } as never,
      ],
    });

    const seen = new Set<string>();
    for (const fact of facts.careNow) {
      const id = `${fact.bucket}:${fact.key ?? fact.id}`;
      expect(seen.has(id)).toBe(false);
      seen.add(id);
    }

    expect(facts.careNow.filter((fact) => fact.key === "alert_state")).toHaveLength(1);
    expect(facts.careNow.filter((fact) => fact.key === "search_active")).toHaveLength(1);
    expect(facts.careNow.filter((fact) => fact.key === "exposure_risk")).toHaveLength(1);
  });

  it("keeps investigation imminent distinct from alert-state facts", () => {
    const facts = deriveMechanicFacts({
      stateFlags: {
        guard_alerted: true,
      },
      stateDeltas: [],
      ledgerAdds: [],
      stats: {},
      pendingReactions: [
        {
          kind: "investigation",
          resolved: false,
          locationId: "hallway",
          cause: "noise",
        } satisfies PendingReaction,
      ],
      currentTurnIndex: 30,
    });

    const careKeys = facts.careNow.map((fact) => fact.key ?? fact.id);
    expect(careKeys).toEqual(expect.arrayContaining(["alert_state", "search_active"]));
    expect(new Set(careKeys).size).toBe(careKeys.length);
    expect(facts.careNow.filter((fact) => (fact.key ?? fact.id) === "search_active")).toHaveLength(1);
    expect(facts.careNow.map((fact) => fact.text)).toEqual(
      expect.arrayContaining([
        "Enemies are on alert.",
        "Enemies are searching.",
      ]),
    );
  });

  it("orders active fire, investigation, exposure, and alert signals deterministically", () => {
    const facts = deriveMechanicFacts({
      stateFlags: {
        guard_alerted: true,
        status_exposed: true,
        environmentHazards: {
          fire: {
            targetKey: "surface",
            status: "burning",
            createdTurnIndex: 20,
            ignitionTurnIndex: 21,
            intensity: 2,
            fuel: 2,
          },
        },
      },
      stateDeltas: [],
      ledgerAdds: [],
      stats: {},
      pendingReactions: [
        {
          kind: "investigation",
          resolved: false,
          locationId: "hallway",
          cause: "noise",
        } satisfies PendingReaction,
      ],
      currentTurnIndex: 30,
    });

    const keys = facts.careNow.map((fact) => fact.key ?? fact.id);
    expect(keys.slice(0, 4)).toEqual([
      "fire_active",
      "exposure_risk",
      "search_active",
      "alert_state",
    ]);
  });

  it("resolves every canonical fact key through the registry without throwing", () => {
    const keys = Object.keys(FACT_TEXT) as Array<keyof typeof FACT_TEXT>;
    for (const key of keys) {
      expect(() => getCanonicalFactText(key, "careNow")).not.toThrow();
      expect(() => getCanonicalFactText(key, "world")).not.toThrow();
      expect(() => getCanonicalFactText(key, "turnChange")).not.toThrow();
      expect(() => getCanonicalFactText(key, "opportunity")).not.toThrow();
      expect(() => getCanonicalFactText(key, "persistent")).not.toThrow();
    }
  });
});
