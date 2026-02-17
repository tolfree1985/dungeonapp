import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { forkScenario } from "@/lib/scenario/scenarioRepo";

export async function POST(req: Request, ctx: { params: { id: string } }) {
  const sourceScenarioId = ctx.params.id;
  const body = await req.json().catch(() => null);

  const newId = body?.newId;
  const ownerId = body?.ownerId ?? null;

  if (typeof newId !== "string") {
    return NextResponse.json(
      { error: { type: "BAD_REQUEST", message: "newId required" } },
      { status: 400 }
    );
  }

  try {
    const forked = await prisma.$transaction(async (tx) => {
      return forkScenario(tx as any, { sourceScenarioId, newId, ownerId });
    });

    return NextResponse.json({ scenario: forked });
  } catch (e: any) {
    if (e?.code === "SCENARIO_NOT_FOUND") {
      return NextResponse.json(
        { error: { type: "NOT_FOUND", code: "SCENARIO_NOT_FOUND" } },
        { status: 404 }
      );
    }
    throw e;
  }
}
