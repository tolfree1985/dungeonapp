import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAdventureFromScenarioId } from "@/lib/game/createAdventureFromScenario";

type PostBody = {
  scenarioId?: unknown;
  adventureId?: unknown;
  ownerId?: unknown;
};

function newAdventureId() {
  return randomUUID();
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as PostBody | null;
  const scenarioId = typeof body?.scenarioId === "string" ? body.scenarioId.trim() : "";
  const adventureIdRaw = typeof body?.adventureId === "string" ? body.adventureId.trim() : "";
  const adventureId = adventureIdRaw || newAdventureId();
  const ownerId = typeof body?.ownerId === "string" && body.ownerId.trim() ? body.ownerId.trim() : null;

  if (!scenarioId) {
    return NextResponse.json({ error: { type: "BAD_REQUEST", message: "scenarioId required" } }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction((tx) =>
      createAdventureFromScenarioId({
        tx,
        adventureId,
        scenarioId,
        ownerId,
      }),
    );

    return NextResponse.json(
      {
        adventureId: result.adventureId,
        scenarioId: result.scenarioId,
        openingPrompt: result.openingPrompt,
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: { type: "BAD_REQUEST", message } }, { status: 400 });
  }
}
