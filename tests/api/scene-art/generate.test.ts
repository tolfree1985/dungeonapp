import { describe, expect, it, vi, beforeEach } from "vitest";
import * as sceneArtGenerator from "@/lib/sceneArtGenerator";
import { GET } from "@/app/api/scene-art/generate/[sceneKey]/route";

const records = new Map<string, any>();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    sceneArt: {
      findUnique: vi.fn(async ({ where: { sceneKey } }: { where: { sceneKey: string } }) => {
        return records.get(sceneKey) ?? null;
      }),
      upsert: vi.fn(async ({ where: { sceneKey }, update, create }: any) => {
        const existing = records.get(sceneKey);
        if (existing) {
          const updated = { ...existing, ...update };
          records.set(sceneKey, updated);
          return updated;
        }
        const created = { ...create };
        records.set(sceneKey, created);
        return created;
      }),
      update: vi.fn(async ({ where: { sceneKey }, data }: any) => {
        const existing = records.get(sceneKey) ?? {};
        const updated = { ...existing, ...data };
        records.set(sceneKey, updated);
        return updated;
      }),
    },
  },
}));

beforeEach(() => {
  records.clear();
  vi.clearAllMocks();
});

describe("/api/scene-art/generate", () => {
  it("generates once and reuses cached row", async () => {
    const sceneKey = "dock_office";
    const params = Promise.resolve({ sceneKey });
    const generateMock = vi
      .spyOn(sceneArtGenerator, "generateImage")
      .mockResolvedValue({ imageUrl: "/scene-art/generated-placeholder.jpg", provider: "remote" });

    const response1 = await GET(new Request("http://localhost"), { params });
    expect(response1.status).toBe(200);
    const payload1 = await response1.json();
    expect(payload1.sceneKey).toBe(sceneKey);
    expect(JSON.parse(payload1.tagsJson ?? "{}").provider).toBe("remote");
    expect(payload1.provider).toBe("remote");
    expect(payload1.status).toBe("ready");

    const response2 = await GET(new Request("http://localhost"), { params });
    expect(response2.status).toBe(200);
    const payload2 = await response2.json();
    expect(payload2).toEqual(payload1);

    expect(generateMock).toHaveBeenCalledTimes(1);
    generateMock.mockRestore();
  });

  it("returns pending row without regenerating", async () => {
    const sceneKey = "dock_office";
    const params = Promise.resolve({ sceneKey });
    records.set(sceneKey, {
      sceneKey,
      status: "pending",
      imageUrl: null,
      basePrompt: "",
      renderPrompt: "",
    });
    const generateMock = vi.spyOn(sceneArtGenerator, "generateImage").mockResolvedValue("/scene-art/generated-placeholder.jpg");

    const response1 = await GET(new Request("http://localhost"), { params });
    const payload1 = await response1.json();
    expect(payload1.status).toBe("pending");
    expect(payload1.provider).toBe("pending");

    const response2 = await GET(new Request("http://localhost"), { params });
    const payload2 = await response2.json();
    expect(payload2).toEqual(payload1);
    expect(generateMock).not.toHaveBeenCalled();
    generateMock.mockRestore();
  });

  it("uses static fallback when provider fails", async () => {
    const sceneKey = "dock_office";
    const params = Promise.resolve({ sceneKey });
    const generateMock = vi
      .spyOn(sceneArtGenerator, "generateImage")
      .mockRejectedValue(new Error("provider down"));

    const response = await GET(new Request("http://localhost"), { params });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.imageUrl).toBe("/scene-art/dock.jpg");
    expect(payload.provider).toBe("static-fallback");

    generateMock.mockRestore();
  });
});
