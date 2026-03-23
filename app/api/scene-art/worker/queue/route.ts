import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const rows = await prisma.sceneArt.findMany({
    where: {
      status: {
        in: ["queued", "generating"],
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
  }));

  return NextResponse.json(payload);
}
