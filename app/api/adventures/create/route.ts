import { NextResponse } from "next/server";
import { creatorRouteError } from "@/lib/api/creatorRouteError";
import { isIdentityError, requireUser, type AuthenticatedUser } from "@/lib/api/identity";
import { isRequestBodyTooLargeError, readJsonWithLimitOrNull } from "@/lib/api/readJsonWithLimit";
import { withRouteLogging } from "@/lib/api/routeLogging";
import { prisma } from "@/lib/prisma";
import { createAdventureFromScenario } from "@/lib/game/createAdventureFromScenario";
import { logStructuredFailure } from "@/lib/turn/observability";

type AdventureCreateRouteDeps = {
  prismaClient?: typeof prisma;
  getUser?: (request: Request) => AuthenticatedUser;
};

type AdventureCreateBody = {
  scenarioId?: unknown;
  seed?: unknown;
};

function parseAdventureCreateBody(body: unknown): { scenarioId: string; seed: string | null } | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const record = body as AdventureCreateBody;
  const scenarioId = typeof record.scenarioId === "string" ? record.scenarioId.trim() : "";
  if (!scenarioId) return null;
  const seed = typeof record.seed === "string" ? record.seed : null;
  return { scenarioId, seed };
}

export async function postHandler(req: Request, deps: AdventureCreateRouteDeps = {}) {
  const db = deps.prismaClient ?? prisma;
  let user;
  try {
    user = (deps.getUser ?? requireUser)(req);
  } catch (error) {
    if (isIdentityError(error)) {
      return creatorRouteError(error.status, error.message, error.code);
    }
    throw error;
  }

  let body: unknown;
  try {
    body = await readJsonWithLimitOrNull(req);
  } catch (error) {
    if (isRequestBodyTooLargeError(error)) {
      return creatorRouteError(413, "Payload too large", "PAYLOAD_TOO_LARGE");
    }
    console.error(error);
    return creatorRouteError(500, "Internal error", "INTERNAL_ERROR");
  }

  const parsed = parseAdventureCreateBody(body);
  if (!parsed) {
    return creatorRouteError(400, "scenarioId required", "BAD_REQUEST");
  }

  try {
    const scenario = await db.scenario.findUnique({
      where: { id: parsed.scenarioId },
      select: { id: true, ownerId: true, visibility: true },
    });

    if (!scenario) {
      return creatorRouteError(404, "SCENARIO_NOT_FOUND", "SCENARIO_NOT_FOUND");
    }
    if (scenario.visibility !== "PUBLIC" && scenario.ownerId !== user.id) {
      return creatorRouteError(403, "NOT_OWNER", "NOT_OWNER");
    }

    const result = await db.$transaction((tx) =>
      createAdventureFromScenario({
        tx,
        scenarioId: parsed.scenarioId,
        ownerId: user.id,
        seed: parsed.seed ?? null,
      }),
    );

    return NextResponse.json(
      {
        adventureId: result.adventureId,
        scenarioId: result.scenarioId,
        latestTurnIndex: result.latestTurnIndex,
      },
      { status: 200 },
    );
  } catch (error) {
    const err = error as { code?: string; status?: number; message?: string };
    if (err?.code === "SCENARIO_MISMATCH") {
      return creatorRouteError(409, "SCENARIO_MISMATCH", "SCENARIO_MISMATCH");
    }
    if (err?.code === "ADVENTURE_FORBIDDEN") {
      return creatorRouteError(403, "ADVENTURE_FORBIDDEN", "ADVENTURE_FORBIDDEN");
    }
    if (typeof err?.status === "number" && err.status >= 500) {
      console.error(error);
      return creatorRouteError(500, "Internal error", "INTERNAL_ERROR");
    }
    logStructuredFailure({
      context: "adventure.create",
      code: err?.code ?? "INTERNAL_ERROR",
      message: err?.message ?? "Internal error",
      details: { scenarioId: parsed.scenarioId, ownerId: user.id },
    });
    return creatorRouteError(typeof err?.status === "number" ? err.status : 400, "Invalid adventure request", "INVALID_REQUEST");
  }
}

export const POST = withRouteLogging("POST /api/adventures/create", (req: Request) => postHandler(req));
