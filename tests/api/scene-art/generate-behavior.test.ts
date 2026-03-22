import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/scene-art/generate/[sceneKey]/route";
import { loadOrCreateSceneArt } from "@/lib/scene-art/loadOrCreateSceneArt";
import { generateImage } from "@/lib/sceneArtGenerator";
import { prisma } from "@/lib/prisma";
import type { SceneArtStatus } from "@/generated/prisma";

vi.mock("@/lib/scene-art/loadOrCreateSceneArt", () => ({
  loadOrCreateSceneArt: vi.fn(),
}));

vi.mock("@/lib/sceneArtGenerator", () => ({
  generateImage: vi.fn(),
}));

const loadOrCreateMock = vi.mocked(loadOrCreateSceneArt);
const generateImageMock = vi.mocked(generateImage);
const updateMock = vi.spyOn(prisma.sceneArt, "update");
const findUniqueOrThrowMock = vi.spyOn(prisma.sceneArt, "findUniqueOrThrow");

const identity = {
  sceneKey: "dock_office",
  sceneText: "You arrive at dawn",
  stylePreset: "victorian-gothic-cinematic",
  renderMode: "full",
  engineVersion: null,
  promptInput: {} as any,
  prompt: { basePrompt: "base", renderPrompt: "render", promptHash: "hash" },
  basePrompt: "base",
  renderPrompt: "render",
  promptHash: "hash",
  fileName: "dock_office-hash.png",
  imageUrl: "/scene-art/dock_office-hash.png",
};

let currentRow: Record<string, any>;

function resetRow(status: SceneArtStatus, imageUrl = identity.imageUrl, updatedAt = new Date()) {
  currentRow = {
    sceneKey: identity.sceneKey,
    promptHash: identity.promptHash,
    status,
    imageUrl,
    basePrompt: identity.basePrompt,
    renderPrompt: identity.renderPrompt,
    stylePreset: identity.stylePreset,
    renderMode: identity.renderMode,
    engineVersion: identity.engineVersion,
    updatedAt,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetRow("ready");
  loadOrCreateMock.mockResolvedValue({ identity, row: currentRow });
  updateMock.mockImplementation(async ({ data }) => {
    Object.assign(currentRow, data);
    return currentRow;
  });
  findUniqueOrThrowMock.mockImplementation(async () => currentRow);
});

function makeRequest(query = "") {
  return {
    nextUrl: new URL(`http://localhost${query}`),
  } as unknown as NextRequest;
}

describe("/api/scene-art/generate", () => {
  const params = Promise.resolve({ sceneKey: identity.sceneKey });

  it("returns cached ready row without calling provider", async () => {
    resetRow("ready");
    loadOrCreateMock.mockResolvedValue({ identity, row: currentRow });
    const response = await GET(makeRequest(), { params });
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.status).toBe("ready");
    expect(generateImageMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("returns generating row without calling provider", async () => {
    resetRow("queued");
    loadOrCreateMock.mockResolvedValue({ identity, row: currentRow });
    const response = await GET(makeRequest(), { params });
    const payload = await response.json();
    expect(payload.status).toBe("queued");
    expect(generateImageMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("blocks retry while failure cooldown is active", async () => {
    resetRow("failed", identity.imageUrl, new Date());
    loadOrCreateMock.mockResolvedValue({ identity, row: currentRow });
    const response = await GET(makeRequest(), { params });
    expect(response.status).toBe(200);
    expect(generateImageMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("marks row generating before calling provider and persists ready artifact", async () => {
    resetRow("failed", identity.imageUrl, new Date(Date.now() - 120_000));
    loadOrCreateMock.mockResolvedValue({ identity, row: currentRow });
    generateImageMock.mockImplementation(async () => {
      expect(currentRow.status).toBe("queued");
      return { imageUrl: identity.imageUrl, provider: "remote" };
    });
    const response = await GET(makeRequest(), { params });
    const payload = await response.json();
    expect(payload.status).toBe("ready");
    expect(currentRow.status).toBe("ready");
    expect(generateImageMock).toHaveBeenCalledTimes(1);
  });

  it("marks row failed when provider throws", async () => {
    resetRow("failed", identity.imageUrl, new Date(Date.now() - 120_000));
    loadOrCreateMock.mockResolvedValue({ identity, row: currentRow });
    generateImageMock.mockRejectedValue(new Error("boom"));
    const response = await GET(makeRequest(), { params });
    expect(response.status).toBe(502);
    expect(currentRow.status).toBe("failed");
  });
});
