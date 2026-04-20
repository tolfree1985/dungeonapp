import { describe, expect, it } from "vitest";
import { WORLD_FLAGS } from "@/lib/engine/worldFlags";
import { postHandler } from "@/app/api/scenario/route";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/scenario", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/scenario", () => {
  it("returns scenario diagnostics alongside the created scenario", async () => {
    const request = makeRequest({
      id: "scenario-diagnostics-test",
      title: "Diagnostics Test",
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
      visibility: "PRIVATE",
    });

    const response = await postHandler(request, {
      getUser: () => ({ id: "user_1" } as any),
      prismaClient: {
        scenario: {
          count: async () => 0,
          findUnique: async ({ where }: any) =>
            where?.id === "scenario-diagnostics-test"
              ? null
              : { id: where?.id ?? "scenario-diagnostics-test", ownerId: "user_1" },
          create: async ({ data }: any) => ({
            id: data.id,
            title: data.title,
            visibility: data.visibility,
            ownerId: data.ownerId,
            sourceScenarioId: data.sourceScenarioId,
          }),
          update: async ({ data }: any) => ({
            id: data.id ?? "scenario-diagnostics-test",
            title: data.title ?? "Diagnostics Test",
            visibility: data.visibility ?? "PRIVATE",
            ownerId: data.ownerId ?? "user_1",
            sourceScenarioId: data.sourceScenarioId ?? null,
          }),
          findMany: async () => [],
        },
      } as any,
    });

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
