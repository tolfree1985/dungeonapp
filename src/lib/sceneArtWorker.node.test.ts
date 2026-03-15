import test from "node:test";
import assert from "node:assert/strict";
import { prisma } from "~/lib/prisma";
import { processQueuedSceneArt } from "~/lib/sceneArtWorker";
import type { SceneArtPriority } from "@/generated/prisma";

const shouldRunDbTests = Boolean(process.env.DATABASE_URL && process.env.SCENE_ART_TESTS === "1");

if (!shouldRunDbTests) {
  test.skip("scene art worker tests require SCENE_ART_TESTS=1 and a running database", () => {});
} else {
  test("processQueuedSceneArt marks queued rows ready", async () => {
    const row = await prisma.sceneArt.create({
      data: {
        sceneKey: `test-scene-${Date.now()}`,
        title: "Test Scene",
        basePrompt: "dark corridor, late night",
        renderPrompt: "dark corridor, late night, cinematic gothic environment art",
        stylePreset: "victorian-gothic-cinematic",
        tagsJson: JSON.stringify(["search"]),
        status: "queued",
        imageUrl: null,
        engineVersion: "test",
      },
    });

    const result = await processQueuedSceneArt({
      limit: 10,
      renderer: async () => ({
        imageUrl: "/test-scene.png",
      }),
    });

    const updated = await prisma.sceneArt.findUnique({
      where: { id: row.id },
    });

    assert.ok(result.ready >= 1);
    assert.equal(updated?.status, "ready");
    assert.equal(updated?.imageUrl, "/test-scene.png");
  });

  test("processQueuedSceneArt marks failed on renderer error", async () => {
    const row = await prisma.sceneArt.create({
      data: {
        sceneKey: `test-scene-fail-${Date.now()}`,
        title: "Test Scene Fail",
        basePrompt: "cold cellar",
        renderPrompt: "cold cellar, moody environment art",
        stylePreset: "victorian-gothic-cinematic",
        tagsJson: JSON.stringify(["threat"]),
        status: "queued",
        imageUrl: null,
        engineVersion: "test",
      },
    });

    await processQueuedSceneArt({
      limit: 10,
      renderer: async () => {
        throw new Error("renderer failed");
      },
    });

    const updated = await prisma.sceneArt.findUnique({
      where: { id: row.id },
    });

    assert.equal(updated?.status, "failed");
  });

  test("processQueuedSceneArt obeys render priority ordering", async () => {
    const orderedKeys = ["priority-low", "priority-normal", "priority-high"];
    const priorities: SceneArtPriority[] = ["low", "normal", "high"];
    await Promise.all(
      orderedKeys.map((sceneKey, index) =>
        prisma.sceneArt.create({
          data: {
            sceneKey,
            title: `Priority ${sceneKey}`,
            basePrompt: "priority test",
            renderPrompt: "priority render",
            stylePreset: "victorian-gothic-cinematic",
            tagsJson: JSON.stringify([]),
            status: "queued",
            imageUrl: null,
            engineVersion: "test",
            renderPriority: priorities[index],
          },
        }),
    );

    const seen: string[] = [];
    await processQueuedSceneArt({
      limit: 5,
      renderer: async ({ sceneKey }) => {
        seen.push(sceneKey);
        return { imageUrl: `/order-${sceneKey}.png` };
      },
    });

    assert.deepEqual(seen, ["priority-high", "priority-normal", "priority-low"]);
  });
}
