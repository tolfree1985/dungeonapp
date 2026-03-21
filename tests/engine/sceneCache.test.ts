import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    sceneArtShotCache: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import { getCachedSceneArt, writeCachedSceneArt } from "@/engine/sceneCache";

const sampleSceneArt = {
  id: "sceneArt1",
  sceneKey: "sceneA",
  status: "ready",
  imageUrl: "https://example.com/image.png",
};

describe("sceneCache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns cached art when the cache entry exists", async () => {
    const findUnique = vi.mocked(prisma.sceneArtShotCache.findUnique);
    findUnique.mockResolvedValueOnce({ sceneArt: sampleSceneArt });

    const result = await getCachedSceneArt("sceneA", "shotA");

    expect(result).toEqual(sampleSceneArt);
    expect(findUnique).toHaveBeenCalledWith({
      where: { sceneKey_shotKey: { sceneKey: "sceneA", shotKey: "shotA" } },
      include: { sceneArt: true },
    });
  });

  it("returns null when the cache contains no entry", async () => {
    const findUnique = vi.mocked(prisma.sceneArtShotCache.findUnique);
    findUnique.mockResolvedValueOnce(null);

    const result = await getCachedSceneArt("sceneB", "shotB");

    expect(result).toBeNull();
  });

  it("upserts a cache entry when writing", async () => {
    const upsert = vi.mocked(prisma.sceneArtShotCache.upsert);
    upsert.mockResolvedValueOnce({});

    await writeCachedSceneArt("sceneA", "shotA", "sceneArt1");

    expect(upsert).toHaveBeenCalledWith({
      where: { sceneKey_shotKey: { sceneKey: "sceneA", shotKey: "shotA" } },
      update: { sceneArtId: "sceneArt1" },
      create: {
        sceneKey: "sceneA",
        shotKey: "shotA",
        sceneArtId: "sceneArt1",
      },
    });
  });
});
