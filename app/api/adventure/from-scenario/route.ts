import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/errorResponse";
import { isIdentityError, requireUser, type AuthenticatedUser } from "@/lib/api/identity";
import { isRequestBodyTooLargeError, readJsonWithLimitOrNull } from "@/lib/api/readJsonWithLimit";
import { withRouteLogging } from "@/lib/api/routeLogging";
import { prisma } from "@/lib/prisma";
import { createAdventureFromScenarioId } from "@/lib/game/createAdventureFromScenario";
import { logStructuredFailure } from "@/lib/turn/observability";

type PostBody = {
  scenarioId?: unknown;
  adventureId?: unknown;
  ownerId?: unknown;
};

function newAdventureId() {
  return randomUUID();
}

type AdventureRouteDeps = {
  prismaClient?: typeof prisma;
  getUser?: (request: NextRequest) => AuthenticatedUser;
};

export async function postHandler(request: NextRequest, deps: AdventureRouteDeps = {}): Promise<Response> {
  const db = deps.prismaClient ?? prisma;
  let user: AuthenticatedUser;
  try {
    user = (deps.getUser ?? requireUser)(request);
  } catch (error) {
    if (isIdentityError(error)) {
      return errorResponse(error.status, error.code);
    }
    throw error;
  }

  let body: PostBody | null;
  try {
    body = (await readJsonWithLimitOrNull<PostBody>(request)) as PostBody | null;
  } catch (error) {
    if (isRequestBodyTooLargeError(error)) {
      return errorResponse(413, "Payload too large");
    }
    console.error(error);
    return errorResponse(500, "Internal error");
  }

  const scenarioId = typeof body?.scenarioId === "string" ? body.scenarioId.trim() : "";
  const adventureIdRaw = typeof body?.adventureId === "string" ? body.adventureId.trim() : "";
  const adventureId = adventureIdRaw || newAdventureId();

  if (!scenarioId) {
    return errorResponse(400, "scenarioId required");
  }

  try {
    const scenario = await db.scenario.findUnique({
      where: { id: scenarioId },
      select: { id: true, ownerId: true, visibility: true },
    });

    if (!scenario) {
      return errorResponse(404, "SCENARIO_NOT_FOUND");
    }
    if (scenario.visibility !== "PUBLIC" && scenario.ownerId !== user.id) {
      return errorResponse(403, "NOT_OWNER");
    }

    const result = await db.$transaction((tx) =>
      createAdventureFromScenarioId({
        tx,
        adventureId,
        scenarioId,
        ownerId: user.id,
      }),
    );

    return NextResponse.json(
      {
        adventureId: result.adventureId,
        scenarioId: result.scenarioId,
        openingPrompt: result.openingPrompt,
      },
      { status: 200 },
    );
  } catch (error) {
    const err = error as { code?: string; status?: number };
    if (err?.code === "ADVENTURE_FORBIDDEN") {
      return errorResponse(403, "ADVENTURE_FORBIDDEN");
    }
    if (err?.code === "SCENARIO_MISMATCH") {
      return errorResponse(409, "SCENARIO_MISMATCH");
    }
    if (typeof err?.status === "number" && err.status >= 500) {
      console.error(error);
      return errorResponse(500, "Internal error");
    }
    if (err?.code === "SCENARIO_INVALID") {
      const message = "message" in err ? (err as any).message : "Invalid scenario";
      logStructuredFailure({
        context: "adventure.fromScenario",
        code: err.code,
        message,
        details: { scenarioId },
      });
    }
    return errorResponse(typeof err?.status === "number" ? err.status : 400, "Invalid scenario request");
  }
}

export const POST: (request: NextRequest) => Promise<Response> = withRouteLogging(
  "POST /api/adventure/from-scenario",
  (request: NextRequest) => postHandler(request),
);
