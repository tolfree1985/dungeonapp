import { NextResponse } from "next/server";
import { workerStateStore } from "@/lib/scene-art/workerStateStore";
import { startSceneArtWorkerBackground } from "@/lib/scene-art/workerLoop";

export async function POST() {
  await workerStateStore.setControl({ paused: false, draining: false });
  await workerStateStore.updateHealth({
    running: true,
    paused: false,
    draining: false,
  });

  void startSceneArtWorkerBackground();

  const health = await workerStateStore.getHealth();
  return NextResponse.json(health);
}
