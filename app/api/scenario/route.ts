import { NextResponse } from "next/server";
import { creatorRouteError } from "@/lib/api/creatorRouteError";
import { isIdentityError, requireUser, type AuthenticatedUser } from "@/lib/api/identity";
import { isRequestBodyTooLargeError, readJsonWithLimitOrNull } from "@/lib/api/readJsonWithLimit";
import { withRouteLogging } from "@/lib/api/routeLogging";
import {
  checkSoftRateLimit,
  softRateActorKey,
  softRateLimitCreatePerMinute,
} from "@/lib/api/softRateLimit";
import { prisma } from "@/lib/prisma";
import { createScenario } from "@/lib/scenario/scenarioRepo";
import {
  ScenarioInvalidError,
  normalizeScenarioContent,
} from "@/lib/scenario/scenarioValidator";
import { logStructuredFailure } from "@/lib/turn/observability";

type ScenarioRouteDeps = {
  prismaClient?: typeof prisma;
  getUser?: (request: Request) => AuthenticatedUser;
};

export async function postHandler(req: Request, deps: ScenarioRouteDeps = {}) {
  const db = deps.prismaClient ?? prisma;
  let user;
  try {
    user = (deps.getUser ?? requireUser)(req);
  } catch (error) {
    if (isIdentityError(error)) {
      return creatorRouteError(error.status, error.message, error.code);
    }
    throw error;
  }

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

  if (typeof id !== "string" || typeof title !== "string" || contentJson == null) {
    return creatorRouteError(400, "id, title, contentJson required", "BAD_REQUEST");
  }

  const rateLimit = checkSoftRateLimit({
    action: "scenario_create",
    actorKey: softRateActorKey(req, user.id),
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
    const normalized = normalizeScenarioContent(contentJson, id);
    const created = await createScenario(db as any, {
      id,
      title,
      summary,
      contentJson: normalized,
      visibility,
      ownerId: user.id,
    });

    return NextResponse.json({ scenario: created });
  } catch (e: any) {
    if (e?.code === "SCENARIO_CAP_EXCEEDED") {
      return creatorRouteError(429, "SCENARIO_CAP_EXCEEDED", "SCENARIO_CAP_EXCEEDED", {
        cap: e?.details?.cap ?? null,
        used: e?.details?.used ?? null,
      });
    }
    if (e?.code === "SCENARIO_ID_EXISTS") {
      return creatorRouteError(409, "SCENARIO_ID_EXISTS", "SCENARIO_ID_EXISTS");
    }
    if (e instanceof ScenarioInvalidError) {
      logStructuredFailure({
        context: "scenario.create",
        code: e.code,
        message: e.message,
        details: { reason: e.reason, scenarioId: id },
      });
      return creatorRouteError(400, e.message, e.code, { reason: e.reason });
    }
    console.error(e);
    logStructuredFailure({
      context: "scenario.create.unhandled",
      code: e?.code ?? "INTERNAL_ERROR",
      message: e?.message ?? "Internal error",
      details: { scenarioId: id },
    });
    return creatorRouteError(500, "Internal error", "INTERNAL_ERROR");
  }
}

export const POST = withRouteLogging("POST /api/scenario", (req: Request) => postHandler(req));
