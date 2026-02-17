import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request, ctx: { params: { id: string } }) {
  const id = ctx.params.id;
  const body = await req.json().catch(() => null);
  const ownerId = body?.ownerId ?? null;

  if (typeof ownerId !== "string") {
    return NextResponse.json(
      { error: { type: "BAD_REQUEST", message: "ownerId required" } },
      { status: 400 }
    );
  }

  const existing = await prisma.scenario.findUnique({
    where: { id },
    select: { id: true, ownerId: true },
  });

  if (!existing) {
    return NextResponse.json(
      { error: { type: "NOT_FOUND", code: "SCENARIO_NOT_FOUND" } },
      { status: 404 }
    );
  }

  if (existing.ownerId !== ownerId) {
    return NextResponse.json(
      { error: { type: "FORBIDDEN", code: "NOT_OWNER" } },
      { status: 403 }
    );
  }

  const updated = await prisma.scenario.update({
    where: { id },
    data: { visibility: "PUBLIC" },
    select: { id: true, visibility: true, ownerId: true },
  });

  return NextResponse.json({ scenario: updated });
}
