import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/errorResponse";
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
      return errorResponse(413, "Payload too large");
    }
    console.error(error);
    return errorResponse(500, "Internal error");
  }

  const ownerId = body?.ownerId ?? null;

  if (typeof ownerId !== "string") {
    return errorResponse(400, "ownerId required");
  }

  try {
    const existing = await prisma.scenario.findUnique({
      where: { id },
      select: { id: true, ownerId: true },
    });

    if (!existing) {
      return errorResponse(404, "SCENARIO_NOT_FOUND");
    }

    if (existing.ownerId !== ownerId) {
      return errorResponse(403, "NOT_OWNER");
    }

    const updated = await prisma.scenario.update({
      where: { id },
      data: { visibility: "PUBLIC" },
      select: { id: true, visibility: true, ownerId: true },
    });

    return NextResponse.json({ scenario: updated });
  } catch (err) {
    console.error(err);
    return errorResponse(500, "Internal error");
  }
}

export const POST = withRouteLogging("POST /api/scenario/[id]/publish", postHandler);
