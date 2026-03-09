import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/errorResponse";
import { isIdentityError, requireUser } from "@/lib/api/identity";
import { withRouteLogging } from "@/lib/api/routeLogging";
import { prisma } from "@/lib/prisma";
import { listMineScenarios } from "@/lib/scenario/scenarioRepo";

function parseTake(raw: string | null): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) return 20;
  return Math.min(50, Math.floor(parsed));
}

async function getHandler(req: Request) {
  let user;
  try {
    user = requireUser(req);
  } catch (error) {
    if (isIdentityError(error)) {
      return errorResponse(error.status, error.code);
    }
    throw error;
  }

  const url = new URL(req.url);
  const take = parseTake(url.searchParams.get("take"));
  const cursorRaw = url.searchParams.get("cursor");
  const cursor = cursorRaw && cursorRaw.trim() ? cursorRaw : undefined;

  try {
    const scenarios = await prisma.$transaction(async (tx) => {
      return listMineScenarios(tx as any, user.id, { take, cursor });
    });

    const nextCursor = scenarios.length === take ? scenarios[scenarios.length - 1]?.id ?? null : null;

    return NextResponse.json({ scenarios, nextCursor });
  } catch (err) {
    console.error(err);
    return errorResponse(500, "Internal error");
  }
}

export const GET = withRouteLogging("GET /api/scenario/mine", getHandler);
