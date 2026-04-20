import { describe, expect, it } from "vitest";
import { postHandler } from "@/app/api/adventures/create/route";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/adventures/create", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/adventures/create", () => {
  it("creates a fresh adventure from a public scenario", async () => {
    const response = await postHandler(makeRequest({ scenarioId: "dungeon-expedition-seed", seed: "seed-1" }), {
      getUser: () => ({ id: "user_1" } as any),
      prismaClient: {
        scenario: {
          findUnique: async ({ where }: any) =>
            where?.id === "dungeon-expedition-seed"
              ? { id: "dungeon-expedition-seed", ownerId: null, visibility: "PUBLIC" }
              : null,
        },
        $transaction: async (fn: any) =>
          fn({
            adventure: {
              findUnique: async () => null,
              upsert: async ({ create }: any) => ({ id: create.id, state: create.state }),
            },
            turn: {
              create: async () => ({}),
            },
            scenario: {
              findUnique: async ({ where }: any) =>
                where?.id === "dungeon-expedition-seed"
                  ? {
                      id: "dungeon-expedition-seed",
                      contentJson: {
                        id: "dungeon-expedition-seed",
                        title: "Dungeon Expedition",
                        start: { prompt: "You stand before the ruined gate." },
                        initialState: {
                          stats: { heat: 0, trust: 2 },
                        },
                      },
                    }
                  : null,
            },
          }),
      } as any,
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      adventureId: string;
      scenarioId: string;
      latestTurnIndex: number;
    };
    expect(payload.adventureId).toBeTruthy();
    expect(payload.scenarioId).toBe("dungeon-expedition-seed");
    expect(payload.latestTurnIndex).toBe(0);
  });
});
