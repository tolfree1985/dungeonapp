import { NextResponse } from "next/server";
import { PrismaClient } from "../../../src/generated/prisma";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

type PostBody = {
  adventureId: string;
  playerText: string; // incoming API field; maps to Turn.playerInput
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<PostBody>;

    if (!body?.adventureId || typeof body.adventureId !== "string") {
      return NextResponse.json({ ok: false, error: "Missing/invalid adventureId" }, { status: 400 });
    }
    if (!body?.playerText || typeof body.playerText !== "string") {
      return NextResponse.json({ ok: false, error: "Missing/invalid playerText" }, { status: 400 });
    }

    const { turn } = await prisma.$transaction(async (tx) => {
      // Atomic, race-safe turnIndex using Adventure.latestTurnIndex
      const adv = await tx.adventure.update({
        where: { id: body.adventureId },
        data: { latestTurnIndex: { increment: 1 } },
        select: { id: true, latestTurnIndex: true },
      });

      const turn = await tx.turn.create({
        data: {
          adventureId: adv.id,                 // ✅ FK-safe (comes from real row)
          turnIndex: adv.latestTurnIndex,      // ✅ required
          playerInput: body.playerText,        // ✅ required

          // ✅ required by schema (stubbed; no LLM yet)
          scene: "You pause at the cellar door. (Stub scene.)",
          resolution: { notes: "Stub response." },
          stateDeltas: [],
          ledgerAdds: [],
        },
      });

      return { turn };
    });

    return NextResponse.json({ ok: true, turn }, { status: 200 });
  } catch (err: any) {
    if (err?.code === "P2025") {
      // Adventure not found (the update failed)
      return NextResponse.json({ ok: false, error: "Adventure not found" }, { status: 404 });
    }
    console.error("POST /api/turn error:", err);
    return NextResponse.json(
      { ok: false, error: "Internal Server Error", details: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
