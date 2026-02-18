import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/errorResponse";
import { isRequestBodyTooLargeError, readJsonWithLimitOrNull } from "@/lib/api/readJsonWithLimit";
import { withRouteLogging } from "@/lib/api/routeLogging";
import { prisma } from "@/lib/prisma";
import { createAdventureFromScenarioId } from "@/lib/game/createAdventureFromScenario";

type PostBody = {
  scenarioId?: unknown;
  adventureId?: unknown;
  ownerId?: unknown;
};

function newAdventureId() {
  return randomUUID();
}

async function postHandler(req: Request) {
  let body: PostBody | null;
  try {
    body = (await readJsonWithLimitOrNull<PostBody>(req)) as PostBody | null;
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
  const ownerId = typeof body?.ownerId === "string" && body.ownerId.trim() ? body.ownerId.trim() : null;

  if (!scenarioId) {
    return errorResponse(400, "scenarioId required");
  }

  try {
    const result = await prisma.$transaction((tx) =>
      createAdventureFromScenarioId({
        tx,
        adventureId,
        scenarioId,
        ownerId,
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
    if (err?.code === "SCENARIO_MISMATCH") {
      return errorResponse(409, "SCENARIO_MISMATCH");
    }
    if (typeof err?.status === "number" && err.status >= 500) {
      console.error(error);
      return errorResponse(500, "Internal error");
    }
    return errorResponse(typeof err?.status === "number" ? err.status : 400, "Invalid scenario request");
  }
}

export const POST = withRouteLogging("POST /api/adventure/from-scenario", postHandler);
