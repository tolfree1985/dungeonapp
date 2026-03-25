import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/scene-art/worker/requeue/route";

const mockRequeue = vi.fn();
vi.mock("@/lib/scene-art/requeueSceneArt", () => ({
  requeueSceneArt: (...args: unknown[]) => mockRequeue(...(args as never)),
}));

describe("scene-art worker requeue", () => {
  beforeEach(() => {
    mockRequeue.mockReset();
  });

  it("returns ok when row requeued", async () => {
    mockRequeue.mockResolvedValue({ sceneKey: "scene", promptHash: "hash", status: "queued" });
    const response = await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ sceneKey: "scene", promptHash: "hash" }) }));
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(mockRequeue).toHaveBeenCalledWith({ sceneKey: "scene", promptHash: "hash" });
  });

  it("returns error when identity missing", async () => {
    const response = await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({}) }));
    expect(response.status).toBe(400);
  });
});
