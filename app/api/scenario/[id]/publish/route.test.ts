import { describe, expect, it } from "vitest";
import { publishPost } from "@/app/api/scenario/[id]/publish/route";
import { WORLD_FLAGS } from "@/lib/engine/worldFlags";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/scenario/scenario-diagnostics-test/publish", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/scenario/[id]/publish", () => {
  it("returns scenario diagnostics alongside the published scenario", async () => {
    const request = makeRequest({});

    const response = await publishPost(
      request as any,
      {
        params: Promise.resolve({ id: "scenario-diagnostics-test" }),
      } as any,
      {
        getUser: () => ({ id: "user_1" } as any),
        prismaClient: {
          scenario: {
            findUnique: async () => ({
              id: "scenario-diagnostics-test",
              ownerId: "user_1",
              contentJson: {
                title: "Diagnostics Test",
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
                  pressure: [],
                  opportunity: [],
                },
              },
            }),
            update: async () => ({
              id: "scenario-diagnostics-test",
              visibility: "PUBLIC",
              ownerId: "user_1",
              contentJson: {
                title: "Diagnostics Test",
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
                  pressure: [],
                  opportunity: [],
                },
              },
            }),
          },
        } as any,
      },
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      scenario: { id: string };
      scenarioDiagnostics: { valid: boolean; errors: unknown[]; warnings: unknown[] };
    };
    expect(payload.scenario.id).toBe("scenario-diagnostics-test");
    expect(payload.scenarioDiagnostics.valid).toBe(true);
    expect(payload.scenarioDiagnostics.warnings.length).toBeGreaterThanOrEqual(1);
  });
});
