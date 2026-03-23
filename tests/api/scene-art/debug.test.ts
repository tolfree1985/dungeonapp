import { describe, it, beforeEach, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/scene-art/debug/[sceneKey]/route";
import { queueSceneArtGeneration } from "@/lib/scene-art/queueSceneArtGeneration";
import { resetPrismaMock } from "../../mocks/prismaMock";
import { getSceneArtIdentity } from "@/lib/sceneArtIdentity";

vi.mock("@/lib/prisma", async () => {
  const { prismaMock } = await import("../../mocks/prismaMock");
  return { prisma: prismaMock };
});

describe("GET /api/scene-art/debug/[sceneKey]", () => {
  const sceneKey = "dock_office";
  const sceneText = "You arrive at dawn to inspect the missing harbor ledgers.";
  const identityInput = { sceneKey, sceneText, renderMode: "full" as const };
  const identity = getSceneArtIdentity(identityInput);

  beforeEach(() => {
    resetPrismaMock();
  });

  it("returns the current scene art row", async () => {
    await queueSceneArtGeneration(identityInput, { autoProcess: false });
    const request = new NextRequest(`http://localhost/api/scene-art/debug/${sceneKey}?promptHash=${identity.promptHash}`);
    const response = await GET(request, { params: { sceneKey } });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.promptHash).toBe(identity.promptHash);
    expect(body.sceneKey).toBe(sceneKey);
    expect(body.status).toBe("queued");
  });
});
