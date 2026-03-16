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

    const response = await GET(new NextRequest("http://localhost/api/scene-art?sceneKey=scene-123"));
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
    expect(mockFindUnique).toHaveBeenCalledWith({ where: { sceneKey: "scene-123" } });
  });

  it("returns 400 when sceneKey query parameter is missing", async () => {
    const response = await GET(new NextRequest("http://localhost/api/scene-art"));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toMatchObject({ ok: false, sceneArt: null, error: expect.any(String) });
  });

  it("returns 404 when the scene art row is not found", async () => {
    mockFindUnique.mockResolvedValue(null);
    const response = await GET(new NextRequest("http://localhost/api/scene-art?sceneKey=missing"));
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body).toMatchObject({ ok: false, sceneArt: null, error: expect.any(String) });
  });
});
