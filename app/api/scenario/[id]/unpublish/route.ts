import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/errorResponse";
import { isIdentityError, requireUser } from "@/lib/api/identity";
import { isRequestBodyTooLargeError, readJsonWithLimitOrNull } from "@/lib/api/readJsonWithLimit";
import { withRouteLogging } from "@/lib/api/routeLogging";
import { prisma } from "@/lib/prisma";

async function postHandler(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let user;
  try {
    user = requireUser(req);
  } catch (error) {
    if (isIdentityError(error)) {
      return errorResponse(error.status, error.code);
    }
    throw error;
  }

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
  try {
    const existing = await prisma.scenario.findUnique({
      where: { id },
      select: { id: true, ownerId: true },
    });

    if (!existing) {
      return errorResponse(404, "SCENARIO_NOT_FOUND");
    }

    if (existing.ownerId !== user.id) {
      return errorResponse(403, "NOT_OWNER");
    }

    const updated = await prisma.scenario.update({
      where: { id },
      data: { visibility: "PRIVATE" },
      select: { id: true, visibility: true, ownerId: true },
    });

    return NextResponse.json({ scenario: updated });
  } catch (err) {
    console.error(err);
    return errorResponse(500, "Internal error");
  }
}

export const POST = withRouteLogging("POST /api/scenario/[id]/unpublish", postHandler);

export async function unpublishPost(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return postHandler(req, context);
}
