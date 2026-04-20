import { describe, expect, it } from "vitest";
import { WORLD_FLAGS } from "@/lib/engine/worldFlags";
import { buildAdventureStateFromScenario } from "@/lib/game/adventureFromScenario";
import {
  analyzeScenarioRuleBundle,
  applyScenarioDiagnosticFix,
  mergeRuleCatalog,
  normalizeScenarioRuleBundle,
  readScenarioRuleBundleFromState,
  validateScenarioRuleBundleSemantically,
} from "@/lib/scenario/scenarioRules";

describe("scenarioRules", () => {
  it("normalizes scenario-defined rule bundles", () => {
    const bundle = normalizeScenarioRuleBundle({
      blocked: [
        {
          id: "SCENARIO_BLOCK",
          blockedAction: "move",
          intent: { mode: "DO", verb: "move" },
          conditions: [{ type: "flag", key: WORLD_FLAGS.route.collapsed, equals: true }],
          cause: "route.collapsed",
          effect: "movement prevented",
          detail: "Scenario-defined collapse blocks the route.",
          scene: "The route is blocked.",
          resolutionNotes: "The route cannot be crossed.",
          ledgerEntry: {
            id: "scenario.move.blocked",
            kind: "action.blocked",
            blockedRuleId: "SCENARIO_BLOCK",
            blockedAction: "move",
            cause: "route.collapsed",
            effect: "movement prevented",
            detail: "Scenario-defined collapse blocks the route.",
          },
        },
      ],
      pressure: [],
      opportunity: [],
    });

    expect(bundle?.blocked).toHaveLength(1);
    expect(bundle?.blocked[0].id).toBe("SCENARIO_BLOCK");
  });

  it("reads scenario rules from adventure state metadata", () => {
    const state = {
      _meta: {
        scenarioRules: {
          blocked: [
            {
              id: "SCENARIO_BLOCK",
              blockedAction: "move",
              intent: { mode: "DO", verb: "move" },
              conditions: [{ type: "flag", key: WORLD_FLAGS.route.collapsed, equals: true }],
              cause: "route.collapsed",
              effect: "movement prevented",
              detail: "Scenario-defined collapse blocks the route.",
              scene: "The route is blocked.",
              resolutionNotes: "The route cannot be crossed.",
              ledgerEntry: {
                id: "scenario.move.blocked",
                kind: "action.blocked",
                blockedRuleId: "SCENARIO_BLOCK",
                blockedAction: "move",
                cause: "route.collapsed",
                effect: "movement prevented",
                detail: "Scenario-defined collapse blocks the route.",
              },
            },
          ],
        },
      },
    };

    const bundle = readScenarioRuleBundleFromState(state);
    expect(bundle?.blocked).toHaveLength(1);
    expect(bundle?.blocked[0].id).toBe("SCENARIO_BLOCK");
  });

  it("stamps scenario rules into adventure metadata during bootstrap", () => {
    const state = buildAdventureStateFromScenario({
      title: "Test Scenario",
      initialState: {
        world: {
          time: 0,
          locationId: "room_start",
          clocks: {},
          flags: {},
        },
      },
      start: {
        prompt: "You stand in a doorway.",
      },
      rules: {
        blocked: [
          {
            id: "SCENARIO_BLOCK",
            blockedAction: "move",
            intent: { mode: "DO", verb: "move" },
            conditions: [{ type: "flag", key: WORLD_FLAGS.route.collapsed, equals: true }],
            cause: "route.collapsed",
            effect: "movement prevented",
            detail: "Scenario-defined collapse blocks the route.",
            scene: "The route is blocked.",
            resolutionNotes: "The route cannot be crossed.",
            ledgerEntry: {
              id: "scenario.move.blocked",
              kind: "action.blocked",
              blockedRuleId: "SCENARIO_BLOCK",
              blockedAction: "move",
              cause: "route.collapsed",
              effect: "movement prevented",
              detail: "Scenario-defined collapse blocks the route.",
            },
          },
        ],
      },
    } as any);

    const meta = state._meta as Record<string, unknown>;
    expect(meta.scenarioRules).toBeDefined();
    expect(readScenarioRuleBundleFromState(state)?.blocked).toHaveLength(1);
  });

  it("prefers scenario rules over built-ins and honors replaces", () => {
    const base = {
      blocked: [
        {
          id: "BASE_BLOCK",
          blockedAction: "move",
          intent: { mode: "DO", verb: "move" },
          conditions: [{ type: "flag", key: WORLD_FLAGS.route.collapsed, equals: true }],
          cause: "base",
          effect: "base effect",
          detail: "base detail",
          scene: "base scene",
          resolutionNotes: "base notes",
          ledgerEntry: {
            id: "base.block",
            kind: "action.blocked",
            blockedRuleId: "BASE_BLOCK",
            blockedAction: "move",
            cause: "base",
            effect: "base effect",
            detail: "base detail",
          },
        },
      ],
      pressure: [],
      opportunity: [],
    };

    const scenario = normalizeScenarioRuleBundle({
      blocked: [
        {
          id: "SCENARIO_BLOCK",
          replaces: ["BASE_BLOCK"],
          blockedAction: "move",
          intent: { mode: "DO", verb: "move" },
          conditions: [{ type: "flag", key: WORLD_FLAGS.route.collapsed, equals: true }],
          cause: "scenario",
          effect: "scenario effect",
          detail: "scenario detail",
          scene: "scenario scene",
          resolutionNotes: "scenario notes",
          ledgerEntry: {
            id: "scenario.block",
            kind: "action.blocked",
            blockedRuleId: "SCENARIO_BLOCK",
            blockedAction: "move",
            cause: "scenario",
            effect: "scenario effect",
            detail: "scenario detail",
          },
        },
      ],
      pressure: [],
      opportunity: [],
    });

    const merged = mergeRuleCatalog(base, scenario);
    expect(merged.blocked[0].id).toBe("SCENARIO_BLOCK");
    expect(merged.blocked.some((rule) => rule.id === "BASE_BLOCK")).toBe(false);
  });

  it("reports overlap warnings when a scenario blocked rule shadows built-ins", () => {
    const bundle = normalizeScenarioRuleBundle({
      blocked: [
        {
          id: "SCENARIO_SHADOW",
          blockedAction: "move",
          intent: { mode: "DO", verb: "move" },
          conditions: [{ type: "flag", key: WORLD_FLAGS.route.collapsed, equals: true }],
          cause: "scenario",
          effect: "scenario effect",
          detail: "scenario detail",
          scene: "scenario scene",
          resolutionNotes: "scenario notes",
          ledgerEntry: {
            id: "scenario.block",
            kind: "action.blocked",
            blockedRuleId: "SCENARIO_SHADOW",
            blockedAction: "move",
            cause: "scenario",
            effect: "scenario effect",
            detail: "scenario detail",
          },
        },
      ],
      pressure: [],
      opportunity: [],
    });

    const analysis = analyzeScenarioRuleBundle(bundle!);
    expect(analysis.valid).toBe(true);
    expect(analysis.warnings.some((diag) => diag.type === "overlap" && diag.ruleId === "SCENARIO_SHADOW")).toBe(true);
  });

  it("suggests and applies replace fixes for overlap diagnostics", () => {
    const bundle = normalizeScenarioRuleBundle({
      blocked: [
        {
          id: "SCENARIO_SHADOW_GENERIC",
          blockedAction: "move",
          intent: { mode: "SAY", verb: "speak" },
          conditions: [{ type: "flag", key: WORLD_FLAGS.guard.alerted, equals: true }],
          cause: "scenario",
          effect: "scenario effect",
          detail: "scenario detail",
          scene: "scenario scene",
          resolutionNotes: "scenario notes",
          ledgerEntry: {
            id: "scenario.block",
            kind: "action.blocked",
            blockedRuleId: "SCENARIO_SHADOW_GENERIC",
            blockedAction: "move",
            cause: "scenario",
            effect: "scenario effect",
            detail: "scenario detail",
          },
        },
        {
          id: "SCENARIO_SHADOW_SPECIFIC",
          blockedAction: "move",
          intent: { mode: "SAY", verb: "speak" },
          conditions: [{ type: "flag", key: WORLD_FLAGS.guard.alerted, equals: true }],
          cause: "scenario specific",
          effect: "scenario specific effect",
          detail: "scenario specific detail",
          scene: "scenario specific scene",
          resolutionNotes: "scenario specific notes",
          ledgerEntry: {
            id: "scenario.block.specific",
            kind: "action.blocked",
            blockedRuleId: "SCENARIO_SHADOW_SPECIFIC",
            blockedAction: "move",
            cause: "scenario specific",
            effect: "scenario specific effect",
            detail: "scenario specific detail",
          },
        },
      ],
      pressure: [],
      opportunity: [],
    });

    const analysis = analyzeScenarioRuleBundle(bundle!);
    const overlap = analysis.warnings.find((diag) => diag.type === "overlap" && diag.ruleId === "SCENARIO_SHADOW_GENERIC");
    expect(overlap?.suggestedFixes?.[0].label).toBe("Add replaces");
    const fixed = applyScenarioDiagnosticFix(bundle!, overlap?.suggestedFixes?.[0]!);
    expect((fixed.blocked.find((rule) => rule.id === "SCENARIO_SHADOW_SPECIFIC") as any).replaces).toContain(
      "SCENARIO_SHADOW_GENERIC",
    );
    expect(analyzeScenarioRuleBundle(fixed).warnings.some((diag) => diag.type === "overlap")).toBe(false);
  });

  it("fails semantic validation for contradictory blocked rules", () => {
    const bundle = normalizeScenarioRuleBundle({
      blocked: [
        {
          id: "DEAD_BLOCK",
          blockedAction: "move",
          intent: { mode: "DO", verb: "move" },
          conditions: [
            { type: "flag", key: WORLD_FLAGS.route.collapsed, equals: true },
            { type: "flag", key: WORLD_FLAGS.route.collapsed, equals: false },
          ],
          cause: "dead",
          effect: "dead effect",
          detail: "dead detail",
          scene: "dead scene",
          resolutionNotes: "dead notes",
          ledgerEntry: {
            id: "dead.block",
            kind: "action.blocked",
            blockedRuleId: "DEAD_BLOCK",
            blockedAction: "move",
            cause: "dead",
            effect: "dead effect",
            detail: "dead detail",
          },
        },
      ],
      pressure: [],
      opportunity: [],
    });

    expect(() => validateScenarioRuleBundleSemantically(bundle!)).toThrow("Scenario rule semantic validation failed");
  });

  it("reports replace errors before merge time", () => {
    const bundle = normalizeScenarioRuleBundle({
      blocked: [
        {
          id: "REPLACE_MISSING",
          replaces: ["NOT_REAL_RULE"],
          blockedAction: "move",
          intent: { mode: "DO", verb: "move" },
          conditions: [{ type: "flag", key: WORLD_FLAGS.route.collapsed, equals: true }],
          cause: "scenario",
          effect: "scenario effect",
          detail: "scenario detail",
          scene: "scenario scene",
          resolutionNotes: "scenario notes",
          ledgerEntry: {
            id: "scenario.block",
            kind: "action.blocked",
            blockedRuleId: "REPLACE_MISSING",
            blockedAction: "move",
            cause: "scenario",
            effect: "scenario effect",
            detail: "scenario detail",
          },
        },
      ],
      pressure: [],
      opportunity: [],
    });

    const analysis = analyzeScenarioRuleBundle(bundle!);
    expect(analysis.errors.some((diag) => diag.type === "replace_error" && diag.ruleId === "REPLACE_MISSING")).toBe(true);
  });
});
