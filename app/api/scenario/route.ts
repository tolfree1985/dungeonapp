import { NextResponse } from "next/server";
import { isRequestBodyTooLargeError, readJsonWithLimitOrNull } from "@/lib/api/readJsonWithLimit";
import { prisma } from "@/lib/prisma";
import { createScenario } from "@/lib/scenario/scenarioRepo";

export async function POST(req: Request) {
  let body: any;
  try {
    body = await readJsonWithLimitOrNull(req);
  } catch (error) {
    if (isRequestBodyTooLargeError(error)) {
      return NextResponse.json({ error: { type: "PAYLOAD_TOO_LARGE" } }, { status: 413 });
    }
    throw error;
  }

  const id = body?.id;
  const title = body?.title;
  const summary = body?.summary ?? null;
  const contentJson = body?.contentJson;
  const visibility = body?.visibility ?? "PRIVATE";
  const ownerId = body?.ownerId ?? null;

  if (typeof id !== "string" || typeof title !== "string" || contentJson == null) {
    return NextResponse.json(
      { error: { type: "BAD_REQUEST", message: "id, title, contentJson required" } },
      { status: 400 },
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
        {
          error: {
            type: "LIMIT_EXCEEDED",
            code: "SCENARIO_CAP_EXCEEDED",
            cap: e?.details?.cap ?? null,
            used: e?.details?.used ?? null,
          },
        },
        { status: 429 },
      );
    }
    throw e;
  }
}
