import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { listPublicScenarios } from "@/lib/scenario/scenarioRepo";

export async function GET() {
  const scenarios = await prisma.$transaction(async (tx) => {
    return listPublicScenarios(tx as any);
  });
  return NextResponse.json({ scenarios });
}
