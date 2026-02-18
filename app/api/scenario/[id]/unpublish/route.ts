import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/errorResponse";
import { isRequestBodyTooLargeError, readJsonWithLimitOrNull } from "@/lib/api/readJsonWithLimit";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request, ctx: { params: { id: string } }) {
  const id = ctx.params.id;
  let body: any;
  try {
    body = await readJsonWithLimitOrNull(req);
  } catch (error) {
    if (isRequestBodyTooLargeError(error)) {
      return errorResponse(413, "Payload Too Large");
    }
    return errorResponse(500, "Internal Server Error");
  }

  const ownerId = body?.ownerId ?? null;

  if (typeof ownerId !== "string") {
    return errorResponse(400, "ownerId required");
  }

  try {
    const existing = await prisma.scenario.findUnique({
      where: { id },
      select: { id: true, ownerId: true },
    });

    if (!existing) {
      return errorResponse(404, "SCENARIO_NOT_FOUND");
    }

    if (existing.ownerId !== ownerId) {
      return errorResponse(403, "NOT_OWNER");
    }

    const updated = await prisma.scenario.update({
      where: { id },
      data: { visibility: "PRIVATE" },
      select: { id: true, visibility: true, ownerId: true },
    });

    return NextResponse.json({ scenario: updated });
  } catch {
    return errorResponse(500, "Internal Server Error");
  }
}
