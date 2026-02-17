import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createScenario } from "@/lib/scenario/scenarioRepo";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);

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

  const created = await prisma.$transaction(async (tx) => {
    return createScenario(tx as any, { id, title, summary, contentJson, visibility, ownerId });
  });

  return NextResponse.json({ scenario: created });
}
