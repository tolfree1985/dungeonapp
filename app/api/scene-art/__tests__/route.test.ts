import { NextRequest } from "next/server";
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    sceneArt: {
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import { buildSceneArtPromptInput, buildScenePrompt } from "@/lib/sceneArtGenerator";
import { GET } from "@/app/api/scene-art/route";

const mockFindUnique = prisma.sceneArt.findUnique as unknown as ReturnType<typeof vi.fn>;

describe("GET /api/scene-art", () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
  });

  it("returns the scene art row when found", async () => {
    mockFindUnique.mockResolvedValue({
      sceneKey: "scene-123",
      status: "ready",
      imageUrl: "/scene.png",
    });

    const sceneKey = "scene-123";
    const query = new URL("http://localhost/api/scene-art");
    query.searchParams.set("sceneKey", sceneKey);
    query.searchParams.set("sceneText", "The dock is quiet at dawn.");
    query.searchParams.set("locationKey", "dock_office");
    query.searchParams.set("timeKey", "dawn");
    const promptInput = buildSceneArtPromptInput({
      sceneKey,
      currentSceneState: {
        text: "The dock is quiet at dawn.",
        locationKey: "dock_office",
        timeKey: "dawn",
      },
      stylePreset: null,
      engineVersion: null,
    });
    const prompt = buildScenePrompt(promptInput);

    const response = await GET(new NextRequest(query.toString()));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      ok: true,
      sceneArt: {
        sceneKey: "scene-123",
        status: "ready",
        imageUrl: "/scene.png",
      },
    });
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: {
        sceneKey_promptHash: {
          sceneKey,
          promptHash: prompt.promptHash,
        },
      },
    });
  });

  it("returns 400 when sceneKey query parameter is missing", async () => {
    const response = await GET(new NextRequest("http://localhost/api/scene-art"));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toMatchObject({ ok: false, sceneArt: null, error: expect.any(String) });
  });

  it("returns 404 when the scene art row is not found", async () => {
    mockFindUnique.mockResolvedValue(null);
    const sceneKey = "missing";
    const query = new URL("http://localhost/api/scene-art");
    query.searchParams.set("sceneKey", sceneKey);
    const response = await GET(new NextRequest(query.toString()));
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body).toMatchObject({ ok: false, sceneArt: null, error: expect.any(String) });
  });
});
