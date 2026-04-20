import { describe, expect, it } from "vitest";
import { createInitialStateV1 } from "@/lib/game/bootstrap";
import { WORLD_FLAGS } from "@/lib/engine/worldFlags";
import { resolveDeterministicTurn } from "@/server/turn/deterministicTurn";
import { evaluateOpportunityRules } from "@/server/turn/opportunityRules";
import { assertTurnTruthContract, classifyTruthKind } from "@/lib/engine/turnTruthContract";

describe("resolver truth contracts", () => {
  it("accepts blocked turns backed by action.blocked ledger and zero deltas", () => {
    const seededState = createInitialStateV1();
    const world = seededState.world as Record<string, unknown>;
    world.flags = {
      ...(world.flags as Record<string, unknown>),
      [WORLD_FLAGS.route.collapsed]: true,
    };

    const result = resolveDeterministicTurn({
      playerText: "move to hallway",
      previousState: seededState,
      turnIndex: 301,
      mode: "DO",
    });

    expect(result.outcome).toBe("BLOCKED");
    expect(classifyTruthKind(result)).toBe("BLOCKED");
    expect(() =>
      assertTurnTruthContract({
        outcome: result.outcome,
        stateDeltas: result.stateDeltas,
        ledgerAdds: result.ledgerAdds,
        blockedTruth: result.blockedTruth,
        pressureTruth: result.pressureTruth,
        opportunityTruth: null,
      }),
    ).not.toThrow();
  });

  it("accepts pressure turns backed by fail-forward evidence", () => {
    const initialState = createInitialStateV1();
    const smash = resolveDeterministicTurn({
      playerText: "smash the crate loudly",
      previousState: initialState,
      turnIndex: 302,
      mode: "DO",
    });
    const hide = resolveDeterministicTurn({
      playerText: "hide behind the crate",
      previousState: smash.nextState,
      turnIndex: 303,
      mode: "DO",
    });
    const wait = resolveDeterministicTurn({
      playerText: "wait",
      previousState: hide.nextState,
      turnIndex: 304,
      mode: "DO",
    });

    expect(wait.outcome).toBe("FAIL_FORWARD");
    expect(classifyTruthKind(wait)).toBe("PRESSURE");
    expect(wait.pressureTruth?.rulesTriggered.length ?? 0).toBeGreaterThan(0);
    expect(() =>
      assertTurnTruthContract({
        outcome: wait.outcome,
        stateDeltas: wait.stateDeltas,
        ledgerAdds: wait.ledgerAdds,
        blockedTruth: null,
        pressureTruth: wait.pressureTruth,
        opportunityTruth: null,
      }),
    ).not.toThrow();
  });

  it("accepts opportunity turns backed by ledger evidence", () => {
    const opportunityTruth = evaluateOpportunityRules(
      {
        intentMode: "DO",
        normalizedInput: "hide in the shadows",
        sceneText: "Deep shadows cover the room",
        effectSummaries: [],
        sceneClock: 0,
      },
      undefined,
    ).opportunityTruth;

    expect(opportunityTruth).not.toBeNull();
    expect(classifyTruthKind({ opportunityTruth })).toBe("OPPORTUNITY");
    expect(() =>
      assertTurnTruthContract({
        outcome: "SUCCESS",
        stateDeltas: [
          {
            kind: "flag.set",
            key: "status.hidden",
            value: true,
          },
        ],
        ledgerAdds: [
          {
            kind: "opportunity.window",
            cause: "deep shadow",
            effect: "concealment improved",
            detail: "The shadows make concealment easier.",
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
        blockedTruth: null,
        pressureTruth: null,
        opportunityTruth,
      }),
    ).not.toThrow();
  });

  it("accepts opportunity turns that surface a concrete hidden-strike benefit", () => {
    expect(() =>
      assertTurnTruthContract({
        outcome: "SUCCESS",
        stateDeltas: [
          {
            kind: "flag.set",
            key: "opportunity.hidden_strike_advantage",
            value: true,
          },
        ],
        ledgerAdds: [
          {
            kind: "opportunity.used",
            cause: "Hidden position exploited",
            effect: "Strike gained positional advantage",
          },
        ],
        blockedTruth: null,
        pressureTruth: null,
        opportunityTruth: {
          quality: "clean",
          rulesTriggered: [
            {
              ruleId: "HIDDEN_STATE_CONCEALMENT_OPPORTUNITY",
              matchedConditions: [{ type: "flag", key: "status.hidden", equals: true }],
              effects: [{ type: "window.set", windowNarrowed: false, opportunityTier: "normal", detail: "Being hidden opens a concealment opportunity." }],
            },
          ],
          benefit: {
            kind: "reduced_cost",
            source: "hidden_window",
            quality: "clean",
            prevented: ["noise increase"],
            detail: "Hidden position lets the strike land without drawing the room's full attention.",
          },
        },
      }),
    ).not.toThrow();
  });

  it("rejects conflicting truth families", () => {
    expect(() =>
      assertTurnTruthContract({
        outcome: "BLOCKED",
        stateDeltas: [],
        ledgerAdds: [
          {
            kind: "action.blocked",
            blockedRuleId: "MOVE_BLOCKED_BY_COLLAPSED_PASSAGE",
            cause: "The passage has collapsed",
            effect: "Move prevented",
          },
        ],
        blockedTruth: {
          ruleId: "MOVE_BLOCKED_BY_COLLAPSED_PASSAGE",
          blockedAction: "move",
          matchedConditions: [{ type: "flag", key: WORLD_FLAGS.route.collapsed, equals: true }],
          cause: "The passage has collapsed",
          effect: "Move prevented",
        },
        pressureTruth: {
          rulesTriggered: [
            {
              ruleId: "WAIT_ADVANCES_INVESTIGATION",
              matchedConditions: [{ type: "statAtLeast", key: "alert", value: 1 }],
              effects: [],
            },
          ],
        },
        opportunityTruth: null,
      }),
    ).toThrow(/multiple truth families/i);
  });
});
