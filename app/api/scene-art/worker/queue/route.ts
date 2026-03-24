import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { autoReclaimStaleSceneArt } from "@/lib/scene-art/reclaimStaleSceneArt";

export async function GET() {
  const autoResult = await autoReclaimStaleSceneArt({ limit: 10 });
  const rows = await prisma.sceneArt.findMany({
    where: {
      status: {
        in: ["queued", "generating", "failed"],
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const payload = rows.map((row) => ({
    sceneKey: row.sceneKey,
    promptHash: row.promptHash,
    status: row.status,
    attemptCount: row.attemptCount ?? 0,
    generationStartedAt: row.generationStartedAt ?? null,
    generationLeaseUntil: row.generationLeaseUntil ?? null,
    updatedAt: row.updatedAt ?? null,
    errorMessage: row.errorMessage ?? null,
  }));

  return NextResponse.json({ rows: payload, autoReclaimedCount: autoResult.reclaimedCount });
}
