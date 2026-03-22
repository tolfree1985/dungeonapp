import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/scene-art/recover/[sceneKey]/route";
import { recoverSceneArt, SceneArtRecoveryError } from "@/lib/scene-art/recoverSceneArt";

vi.mock("@/lib/scene-art/recoverSceneArt", () => ({
  recoverSceneArt: vi.fn(),
  SceneArtRecoveryError: class extends Error {
    code = "";
    status = 400;
    constructor(code: string, message: string, status?: number) {
      super(message);
      this.code = code;
      this.status = status ?? 400;
    }
  },
}));

describe("POST /api/scene-art/recover/[sceneKey]", () => {
  const mockRequestBody = {
    action: "retry" as const,
    sceneText: "scene text",
    stylePreset: null as string | null,
    renderMode: "full" as const,
  };

  const makeRequest = () => {
    return { json: () => Promise.resolve(mockRequestBody) } as unknown as NextRequest;
  };

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 for retry on failed", async () => {
    const mockFn = recoverSceneArt as unknown as vi.Mock;
    mockFn.mockResolvedValueOnce({
      status: "pending",
      promptHash: "abc",
      imageUrl: null,
    });
    const response = await POST(makeRequest(), { params: Promise.resolve({ sceneKey: "dock_office" }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "pending", promptHash: "abc", imageUrl: null });
  });

  it("returns 200 for retry on missing", async () => {
    const mockFn = recoverSceneArt as unknown as vi.Mock;
    mockFn.mockResolvedValueOnce({
      status: "pending",
      promptHash: "abc",
      imageUrl: null,
    });
    const response = await POST(makeRequest(), { params: Promise.resolve({ sceneKey: "dock_office" }) });
    expect(response.status).toBe(200);
  });

  it("returns 409 for retry while generating", async () => {
    const mockFn = recoverSceneArt as unknown as vi.Mock;
    mockFn.mockRejectedValueOnce(new SceneArtRecoveryError("SCENE_ART_RECOVERY_INVALID_STATE", "Retry not allowed", 409));
    const response = await POST(makeRequest(), { params: Promise.resolve({ sceneKey: "dock_office" }) });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "SCENE_ART_RECOVERY_INVALID_STATE", message: "Retry not allowed" });
  });
});
