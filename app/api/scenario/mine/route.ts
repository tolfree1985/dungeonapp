import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { listMineScenarios } from "@/lib/scenario/scenarioRepo";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const ownerId = url.searchParams.get("ownerId");

  if (!ownerId) {
    return NextResponse.json(
      { error: { type: "BAD_REQUEST", message: "ownerId required" } },
      { status: 400 }
    );
  }

  const scenarios = await prisma.$transaction(async (tx) => {
    return listMineScenarios(tx as any, ownerId);
  });

  return NextResponse.json({ scenarios });
}
