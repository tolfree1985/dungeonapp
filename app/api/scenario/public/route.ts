import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { listPublicScenarios } from "@/lib/scenario/scenarioRepo";

function parseTake(raw: string | null): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) return 20;
  return Math.min(50, Math.floor(parsed));
}

export async function GET(req?: Request) {
  const params = req ? new URL(req.url).searchParams : new URLSearchParams();
  const take = parseTake(params.get("take"));
  const cursorRaw = params.get("cursor");
  const cursor = cursorRaw && cursorRaw.trim() ? cursorRaw : undefined;

  const scenarios = await prisma.$transaction(async (tx) => {
    return listPublicScenarios(tx as any, { take, cursor });
  });

  const nextCursor = scenarios.length === take ? scenarios[scenarios.length - 1]?.id ?? null : null;

  return NextResponse.json({ scenarios, nextCursor });
}
