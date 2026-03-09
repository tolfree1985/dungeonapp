import { NextRequest, NextResponse } from "next/server";
import { creatorRouteError } from "@/lib/api/creatorRouteError";
import { isIdentityError, requireUser } from "@/lib/api/identity";
import { isRequestBodyTooLargeError, readJsonWithLimitOrNull } from "@/lib/api/readJsonWithLimit";
import { withRouteLogging } from "@/lib/api/routeLogging";
import { prisma } from "@/lib/prisma";

type PublishRouteDeps = {
  prismaClient?: typeof prisma;
  getUser?: typeof requireUser;
};

async function postHandler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
  deps: PublishRouteDeps = {},
): Promise<Response> {
  const { id } = await params;
  const db = deps.prismaClient ?? prisma;
  let user;
  try {
    user = (deps.getUser ?? requireUser)(request);
  } catch (error) {
    if (isIdentityError(error)) {
      return creatorRouteError(error.status, error.message, error.code);
    }
    throw error;
  }

  let body: any;
  try {
    body = await readJsonWithLimitOrNull(request);
  } catch (error) {
    if (isRequestBodyTooLargeError(error)) {
      return creatorRouteError(413, "Payload too large", "PAYLOAD_TOO_LARGE");
    }
    console.error(error);
    return creatorRouteError(500, "Internal error", "INTERNAL_ERROR");
  }
  try {
    const existing = await db.scenario.findUnique({
      where: { id },
      select: { id: true, ownerId: true },
    });

    if (!existing) {
      return creatorRouteError(404, "SCENARIO_NOT_FOUND", "SCENARIO_NOT_FOUND");
    }

    if (existing.ownerId !== user.id) {
      return creatorRouteError(403, "NOT_OWNER", "NOT_OWNER");
    }

    const updated = await db.scenario.update({
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

export { postHandler as publishPost };
export const POST: (
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) => Promise<Response> = withRouteLogging("POST /api/scenario/[id]/publish", (request, context) =>
  postHandler(request, context),
);
