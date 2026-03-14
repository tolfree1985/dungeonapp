import test from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { processQueuedSceneArt } from "@/lib/sceneArtWorker";

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
