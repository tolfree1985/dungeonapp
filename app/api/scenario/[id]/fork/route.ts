import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/errorResponse";
import { isIdentityError, requireUser } from "@/lib/api/identity";
import { isRequestBodyTooLargeError, readJsonWithLimitOrNull } from "@/lib/api/readJsonWithLimit";
import { withRouteLogging } from "@/lib/api/routeLogging";
import { checkSoftRateLimit, softRateActorKey, softRateLimitForkPerMinute } from "@/lib/api/softRateLimit";
import { prisma } from "@/lib/prisma";
import { forkScenario } from "@/lib/scenario/scenarioRepo";

async function postHandler(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sourceScenarioId } = await params;
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

  const newId = body?.newId;

  if (typeof newId !== "string") {
    return errorResponse(400, "newId required");
  }

  const rateLimit = checkSoftRateLimit({
    action: "scenario_fork",
    actorKey: softRateActorKey(req, user.id),
    limitPerMinute: softRateLimitForkPerMinute(),
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "RATE_LIMITED" },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
      },
    );
  }

  try {
    const forked = await prisma.$transaction(async (tx) => {
      return forkScenario(tx as any, { sourceScenarioId, newId, ownerId: user.id });
    });

    return NextResponse.json({ scenario: forked });
  } catch (e: any) {
    if (e?.code === "SCENARIO_NOT_FOUND") {
      return errorResponse(404, "SCENARIO_NOT_FOUND");
    }
    if (e?.code === "SCENARIO_CAP_EXCEEDED") {
      return NextResponse.json(
        { error: "SCENARIO_CAP_EXCEEDED", code: "SCENARIO_CAP_EXCEEDED", cap: e?.details?.cap ?? null, used: e?.details?.used ?? null },
        { status: 429 },
      );
    }
    console.error(e);
    return errorResponse(500, "Internal error");
  }
}

export const POST = withRouteLogging("POST /api/scenario/[id]/fork", postHandler);
