import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildFinalSceneArtContract } from "@/lib/scene-art/sceneArtContract";
import type { SceneArtContract } from "@/lib/scene-art/renderOpportunity";
import type { SceneArtStatus } from "@/generated/prisma";

type RenderSceneRequest = {
  adventureId: string;
  sceneKey: string;
  promptHash: string;
};

type RenderSceneResponse = {
  ok: true;
  sceneArt: SceneArtContract | null;
  queued: boolean;
  reusedExisting: boolean;
};

type CanonicalScenePayload = {
  sceneKey: string;
  promptHash: string;
  basePrompt: string;
  renderPrompt: string;
  stylePreset?: string | null;
  tags?: string[];
};

function isCanonicalScenePayload(value: unknown): value is CanonicalScenePayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.sceneKey === "string" &&
    typeof candidate.promptHash === "string" &&
    typeof candidate.basePrompt === "string" &&
    typeof candidate.renderPrompt === "string"
  );
}

function toSceneArtContract(row: { sceneKey: string; promptHash: string; status: SceneArtStatus; imageUrl: string | null }) {
  return buildFinalSceneArtContract(row);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

async function findCanonicalScenePayload(args: {
  adventureId: string;
  sceneKey: string;
  promptHash: string;
}): Promise<CanonicalScenePayload | null> {
  const recentTurns = await prisma.turn.findMany({
    where: { adventureId: args.adventureId },
    orderBy: { turnIndex: "desc" },
    take: 20,
    select: { turnIndex: true, debug: true },
  });
  for (const turn of recentTurns) {
    const debug = asRecord(turn.debug ?? null);
    const identity = asRecord(debug?.sceneIdentity ?? null);
    if (identity?.sceneKey !== args.sceneKey || identity?.promptHash !== args.promptHash) {
      continue;
    }
    const payload = debug?.canonicalScenePayload;
    if (isCanonicalScenePayload(payload)) {
      return payload;
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<RenderSceneRequest>;
    const adventureId = body.adventureId?.trim();
    const sceneKey = body.sceneKey?.trim();
    const promptHash = body.promptHash?.trim();

    if (!adventureId || !sceneKey || !promptHash) {
      return NextResponse.json({ ok: false, error: "INVALID_REQUEST" }, { status: 400 });
    }

    const adventure = await prisma.adventure.findUnique({
      where: { id: adventureId },
      select: { id: true, sceneRenderCredits: true },
    });
    if (!adventure) {
      return NextResponse.json({ ok: false, error: "ADVENTURE_NOT_FOUND" }, { status: 404 });
    }

    const readyRow = await prisma.sceneArt.findFirst({
      where: {
        sceneKey,
        promptHash,
        status: "ready",
        imageUrl: { not: null },
      },
      orderBy: { updatedAt: "desc" },
    });

    if (readyRow) {
      return NextResponse.json({
        ok: true,
        sceneArt: toSceneArtContract(readyRow),
        queued: false,
        reusedExisting: true,
      } satisfies RenderSceneResponse);
    }

    const inflightRow = await prisma.sceneArt.findFirst({
      where: {
        sceneKey,
        promptHash,
        status: { in: ["queued", "generating"] },
      },
      orderBy: { updatedAt: "desc" },
    });

    if (inflightRow) {
      return NextResponse.json({
        ok: true,
        sceneArt: toSceneArtContract(inflightRow),
        queued: true,
        reusedExisting: true,
      } satisfies RenderSceneResponse);
    }

    const canonicalPayload = await findCanonicalScenePayload({
      adventureId,
      sceneKey,
      promptHash,
    });
    if (!canonicalPayload) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "No canonical scene payload available for this identity. Persist it via /api/turn before invoking manual render.",
        },
        { status: 409 },
      );
    }

    let queuedRow;
    try {
      queuedRow = await prisma.$transaction(async (tx) => {
        const updated = await tx.adventure.updateMany({
          where: { id: adventureId, sceneRenderCredits: { gt: 0 } },
          data: { sceneRenderCredits: { decrement: 1 } },
        });
        if (updated.count === 0) {
          throw new Error("INSUFFICIENT_RENDER_CREDITS");
        }
        return tx.sceneArt.create({
          data: {
            sceneKey,
            promptHash,
            status: "queued",
            basePrompt: canonicalPayload.basePrompt,
            renderPrompt: canonicalPayload.renderPrompt,
            stylePreset: canonicalPayload.stylePreset ?? undefined,
            tagsJson:
              canonicalPayload.tags && canonicalPayload.tags.length > 0
                ? JSON.stringify(canonicalPayload.tags)
                : undefined,
          },
        });
      });
    } catch (error) {
      if (error instanceof Error && error.message === "INSUFFICIENT_RENDER_CREDITS") {
        return NextResponse.json(
          {
            ok: false,
            error: "INSUFFICIENT_RENDER_CREDITS",
          },
          { status: 402 },
        );
      }
      throw error;
    }

    return NextResponse.json({
      ok: true,
      sceneArt: toSceneArtContract(queuedRow),
      queued: true,
      reusedExisting: false,
    } satisfies RenderSceneResponse);
  } catch (error) {
    console.error("scene.art.render.error", error);
    return NextResponse.json({ ok: false, error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
