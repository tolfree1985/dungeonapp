import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/server/turn/deterministicTurn", () => ({
  resolveDeterministicTurn: vi.fn(),
}));

vi.mock("@/lib/engine/contracts/assertAdventureCompatibility", () => ({
  assertAdventureCompatibility: vi.fn(),
}));

import { resolveDeterministicTurn } from "@/server/turn/deterministicTurn";
import { assertAdventureCompatibility } from "@/lib/engine/contracts/assertAdventureCompatibility";
import { turnPersistence } from "@/app/api/turn/turnDb";

describe("turnDb", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes canonical truth payloads to turn persistence", async () => {
    vi.mocked(assertAdventureCompatibility).mockResolvedValue({
      engineVersion: "test-engine",
      scenarioContentHash: "scenario-hash",
      scenarioVersion: 1,
      stateSchemaVersion: 1,
    });

    vi.mocked(resolveDeterministicTurn).mockReturnValue({
      action: {
        mode: "DO",
        rawInput: "move forward",
        normalizedInput: "move forward",
        verb: "move",
        qualifiers: [],
      },
      scene: "The route is blocked.",
      resolution: { outcome: "BLOCKED" },
      nextState: {
        world: { flags: { route_collapsed: true } },
        _meta: { scenarioId: "scenario-1" },
      },
      stateDeltas: [],
      ledgerAdds: [
        {
          kind: "action.blocked",
          blockedRuleId: "MOVE_BLOCKED_BY_COLLAPSED_PASSAGE",
          cause: "The passage has collapsed",
          effect: "Move prevented",
        },
      ],
      mechanicFacts: { world: [{ id: "route_collapsed" }], careNow: [] },
      blockedTruth: {
        ruleId: "MOVE_BLOCKED_BY_COLLAPSED_PASSAGE",
        blockedAction: "move",
        matchedConditions: [{ type: "flag", key: "route_collapsed", equals: true }],
        cause: "The passage has collapsed",
        effect: "Move prevented",
      },
      pressureTruth: { rulesTriggered: [] },
      opportunityTruth: { rulesTriggered: [] },
    } as any);

    const turnCreate = vi.fn().mockResolvedValue({
      id: "turn-1",
      turnIndex: 1,
      scene: "The route is blocked.",
      resolution: { outcome: "BLOCKED" },
      stateDeltas: [],
      ledgerAdds: [{ kind: "action.blocked", blockedRuleId: "MOVE_BLOCKED_BY_COLLAPSED_PASSAGE" }],
    });
    const turnEventCreate = vi.fn().mockResolvedValue({});
    const adventureUpdate = vi.fn().mockResolvedValue({});
    const adventureFind = vi.fn().mockResolvedValue({
      id: "adv-1",
      latestTurnIndex: 0,
      state: { _meta: { scenarioId: "scenario-1" } },
    });
    const turnEventFindFirst = vi.fn().mockResolvedValue(null);
    const db = {
      adventure: {
        findUniqueOrThrow: adventureFind,
        update: adventureUpdate,
      },
      turn: { create: turnCreate },
      turnEvent: { findFirst: turnEventFindFirst, create: turnEventCreate },
    } as any;

    const result = await turnPersistence(
      {
        adventureId: "adv-1",
        playerText: "move forward",
        idempotencyKey: "idem-1",
        mode: "DO",
        model: {
          scene: "The route is blocked.",
          resolution: "blocked",
          outputTokens: 12,
        },
        preflight: { perTurnMaxOutputTokens: 64 },
        userId: "user-1",
        monthKey: "2026-04",
        holdKey: "hold-1",
        leaseKey: "lease-1",
        estInputTokens: 10,
        hashHex: (value) => `hash:${value}`,
        asUnknownArray: (value) => (Array.isArray(value) ? value : []),
        commitUsageAndRelease: vi.fn().mockResolvedValue({ ok: true }),
      },
      db,
    );

    expect(turnCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        blockedTruth: {
          ruleId: "MOVE_BLOCKED_BY_COLLAPSED_PASSAGE",
          blockedAction: "move",
          matchedConditions: [{ type: "flag", key: "route_collapsed", equals: true }],
          cause: "The passage has collapsed",
          effect: "Move prevented",
        },
        pressureTruth: { rulesTriggered: [] },
        opportunityTruth: { rulesTriggered: [] },
      }),
    });
    expect(turnEventCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        turnJson: expect.objectContaining({
          blockedTruth: {
            ruleId: "MOVE_BLOCKED_BY_COLLAPSED_PASSAGE",
            blockedAction: "move",
            matchedConditions: [{ type: "flag", key: "route_collapsed", equals: true }],
            cause: "The passage has collapsed",
            effect: "Move prevented",
          },
          pressureTruth: { rulesTriggered: [] },
          opportunityTruth: { rulesTriggered: [] },
        }),
      }),
    });
    expect(result.turn).toEqual(
      expect.objectContaining({
        blockedTruth: {
          ruleId: "MOVE_BLOCKED_BY_COLLAPSED_PASSAGE",
          blockedAction: "move",
          matchedConditions: [{ type: "flag", key: "route_collapsed", equals: true }],
          cause: "The passage has collapsed",
          effect: "Move prevented",
        },
        pressureTruth: { rulesTriggered: [] },
        opportunityTruth: { rulesTriggered: [] },
      }),
    );
  });
});
