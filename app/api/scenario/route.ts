import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/errorResponse";
import { isRequestBodyTooLargeError, readJsonWithLimitOrNull } from "@/lib/api/readJsonWithLimit";
import { withRouteLogging } from "@/lib/api/routeLogging";
import {
  checkSoftRateLimit,
  softRateActorKey,
  softRateLimitCreatePerMinute,
} from "@/lib/api/softRateLimit";
import { prisma } from "@/lib/prisma";
import { createScenario } from "@/lib/scenario/scenarioRepo";

async function postHandler(req: Request) {
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

  const id = body?.id;
  const title = body?.title;
  const summary = body?.summary ?? null;
  const contentJson = body?.contentJson;
  const visibility = body?.visibility ?? "PRIVATE";
  const ownerId = body?.ownerId ?? null;

  if (typeof id !== "string" || typeof title !== "string" || contentJson == null) {
    return errorResponse(400, "id, title, contentJson required");
  }

  const rateLimit = checkSoftRateLimit({
    action: "scenario_create",
    actorKey: softRateActorKey(req, typeof ownerId === "string" ? ownerId : null),
    limitPerMinute: softRateLimitCreatePerMinute(),
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
    const created = await prisma.$transaction(async (tx) => {
      return createScenario(tx as any, { id, title, summary, contentJson, visibility, ownerId });
    });

    return NextResponse.json({ scenario: created });
  } catch (e: any) {
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

export const POST = withRouteLogging("POST /api/scenario", postHandler);
