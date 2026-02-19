import { NextResponse } from "next/server";
import { creatorRouteError } from "@/lib/api/creatorRouteError";
import { isRequestBodyTooLargeError, readJsonWithLimitOrNull } from "@/lib/api/readJsonWithLimit";
import { withRouteLogging } from "@/lib/api/routeLogging";
import { prisma } from "@/lib/prisma";

async function postHandler(req: Request, ctx: { params: { id: string } }) {
  const id = ctx.params.id;
  let body: any;
  try {
    body = await readJsonWithLimitOrNull(req);
  } catch (error) {
    if (isRequestBodyTooLargeError(error)) {
      return creatorRouteError(413, "Payload too large", "PAYLOAD_TOO_LARGE");
    }
    console.error(error);
    return creatorRouteError(500, "Internal error", "INTERNAL_ERROR");
  }

  const ownerId = body?.ownerId ?? null;

  if (typeof ownerId !== "string") {
    return creatorRouteError(400, "ownerId required", "BAD_REQUEST");
  }

  try {
    const existing = await prisma.scenario.findUnique({
      where: { id },
      select: { id: true, ownerId: true },
    });

    if (!existing) {
      return creatorRouteError(404, "SCENARIO_NOT_FOUND", "SCENARIO_NOT_FOUND");
    }

    if (existing.ownerId !== ownerId) {
      return creatorRouteError(403, "NOT_OWNER", "NOT_OWNER");
    }

    const updated = await prisma.scenario.update({
      where: { id },
      data: { visibility: "PUBLIC" },
      select: { id: true, visibility: true, ownerId: true },
    });

    return NextResponse.json({ scenario: updated });
  } catch (err) {
    console.error(err);
    return creatorRouteError(500, "Internal error", "INTERNAL_ERROR");
  }
}

export const POST = withRouteLogging("POST /api/scenario/[id]/publish", postHandler);
