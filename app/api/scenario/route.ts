import { NextResponse } from "next/server";
import { creatorRouteError } from "@/lib/api/creatorRouteError";
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
      return creatorRouteError(413, "Payload too large", "PAYLOAD_TOO_LARGE");
    }
    console.error(error);
    return creatorRouteError(500, "Internal error", "INTERNAL_ERROR");
  }

  const id = body?.id;
  const title = body?.title;
  const summary = body?.summary ?? null;
  const contentJson = body?.contentJson;
  const visibility = body?.visibility ?? "PRIVATE";
  const ownerId = body?.ownerId ?? null;

  if (typeof id !== "string" || typeof title !== "string" || contentJson == null) {
    return creatorRouteError(400, "id, title, contentJson required", "BAD_REQUEST");
  }

  const rateLimit = checkSoftRateLimit({
    action: "scenario_create",
    actorKey: softRateActorKey(req, typeof ownerId === "string" ? ownerId : null),
    limitPerMinute: softRateLimitCreatePerMinute(),
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "RATE_LIMITED", code: "RATE_LIMITED" },
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
      return creatorRouteError(429, "SCENARIO_CAP_EXCEEDED", "SCENARIO_CAP_EXCEEDED", {
        cap: e?.details?.cap ?? null,
        used: e?.details?.used ?? null,
      });
    }
    console.error(e);
    return creatorRouteError(500, "Internal error", "INTERNAL_ERROR");
  }
}

export const POST = withRouteLogging("POST /api/scenario", postHandler);
