import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/errorResponse";
import { withRouteLogging } from "@/lib/api/routeLogging";
import { prisma } from "@/lib/prisma";
import { listMineScenarios } from "@/lib/scenario/scenarioRepo";

function parseTake(raw: string | null): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) return 20;
  return Math.min(50, Math.floor(parsed));
}

async function getHandler(req: Request) {
  const url = new URL(req.url);
  const ownerId = url.searchParams.get("ownerId");
  const take = parseTake(url.searchParams.get("take"));
  const cursorRaw = url.searchParams.get("cursor");
  const cursor = cursorRaw && cursorRaw.trim() ? cursorRaw : undefined;

  if (!ownerId) {
    return errorResponse(400, "ownerId required");
  }

  try {
    const scenarios = await prisma.$transaction(async (tx) => {
      return listMineScenarios(tx as any, ownerId, { take, cursor });
    });

    const nextCursor = scenarios.length === take ? scenarios[scenarios.length - 1]?.id ?? null : null;

    return NextResponse.json({ scenarios, nextCursor });
  } catch {
    return errorResponse(500, "Internal error");
  }
}

export const GET = withRouteLogging("GET /api/scenario/mine", getHandler);
