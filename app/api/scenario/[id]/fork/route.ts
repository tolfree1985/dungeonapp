import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/errorResponse";
import { isRequestBodyTooLargeError, readJsonWithLimitOrNull } from "@/lib/api/readJsonWithLimit";
import { withRouteLogging } from "@/lib/api/routeLogging";
import { checkSoftRateLimit, softRateActorKey, softRateLimitForkPerMinute } from "@/lib/api/softRateLimit";
import { prisma } from "@/lib/prisma";
import { forkScenario } from "@/lib/scenario/scenarioRepo";

async function postHandler(req: Request, ctx: { params: { id: string } }) {
  const sourceScenarioId = ctx.params.id;
  let body: any;
  try {
    body = await readJsonWithLimitOrNull(req);
  } catch (error) {
    if (isRequestBodyTooLargeError(error)) {
      return errorResponse(413, "Payload Too Large");
    }
    return errorResponse(500, "Internal Server Error");
  }

  const newId = body?.newId;
  const ownerId = body?.ownerId ?? null;

  if (typeof newId !== "string") {
    return errorResponse(400, "newId required");
  }

  const rateLimit = checkSoftRateLimit({
    action: "scenario_fork",
    actorKey: softRateActorKey(req, typeof ownerId === "string" ? ownerId : null),
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
      return forkScenario(tx as any, { sourceScenarioId, newId, ownerId });
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
    return errorResponse(500, "Internal Server Error");
  }
}

export const POST = withRouteLogging("POST /api/scenario/[id]/fork", postHandler);
