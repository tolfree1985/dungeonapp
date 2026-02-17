import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { listMineScenarios } from "@/lib/scenario/scenarioRepo";

function parseTake(raw: string | null): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) return 20;
  return Math.min(50, Math.floor(parsed));
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const ownerId = url.searchParams.get("ownerId");
  const take = parseTake(url.searchParams.get("take"));
  const cursorRaw = url.searchParams.get("cursor");
  const cursor = cursorRaw && cursorRaw.trim() ? cursorRaw : undefined;

  if (!ownerId) {
    return NextResponse.json(
      { error: { type: "BAD_REQUEST", message: "ownerId required" } },
      { status: 400 }
    );
  }

  const page = await prisma.$transaction(async (tx) => {
    return listMineScenarios(tx as any, ownerId, { take: take + 1, cursor });
  });

  const scenarios = page.slice(0, take);
  const nextCursor = page.length > take ? scenarios[scenarios.length - 1]?.id ?? null : null;

  return NextResponse.json({ scenarios, nextCursor });
}
