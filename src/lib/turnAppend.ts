import { PrismaClient } from "@/generated/prisma";
import { isP2002, p2002Targets } from "./prismaErrors";

type AppendInput = {
  adventureId: string;
  expectedSeq: number;
  idempotencyKey: string;
  // You already have these; include whatever “envelope” fields define the request input.
  envelope: unknown;

  // Deterministic outputs from your engine (assumed correct)
  computed: {
    prevEventId: string | null;
    seq: number; // expectedSeq + 1
    baseStateHash: string;
    resultStateHash: string;
    eventHash: string;
    envelopeHash: string;
    chainHash: string;
  };
};

type AppendResult =
  | { status: 201; event: any }
  | { status: 200; event: any } // idempotent reuse
  | { status: 409; code: "STALE_EXPECTED_SEQ"; head?: any }
  | { status: 409; code: "IDEMPOTENCY_KEY_REUSE_DIFFERENT_INPUT"; existing: any };

export async function appendTurnEvent(prisma: PrismaClient, input: AppendInput): Promise<AppendResult> {
  const { adventureId, expectedSeq, idempotencyKey, computed } = input;

  return prisma.$transaction(async (tx) => {
    try {
      const created = await tx.turnEvent.create({
        data: {
          adventureId,
          prevEventId: computed.prevEventId,
          seq: computed.seq,
          baseStateHash: computed.baseStateHash,
          resultStateHash: computed.resultStateHash,
          eventHash: computed.eventHash,
          idempotencyKey,
        } as any,
      });
      return { status: 201, event: created };
    } catch (e: any) {
      if (!isP2002(e)) throw e;

      const targets = p2002Targets(e).sort().join(",");
      // NOTE: targets is usually like "adventureId,seq" or "adventureId,idempotencyKey"
      if (targets.includes("idempotencyKey")) {
        const existing = await tx.turnEvent.findFirst({
          where: { adventureId, idempotencyKey },
        });
        if (!existing) {
          // Extremely rare edge case; treat as retryable in caller if you add a retry loop later.
          throw e;
        }
        return { status: 200, event: existing };
        return {
          status: 409,
          code: "IDEMPOTENCY_KEY_REUSE_DIFFERENT_INPUT",
          existing,
        };
      }

      if (targets.includes("seq")) {
        const head = await tx.turnEvent.findFirst({
          where: { adventureId },
          orderBy: { seq: "desc" },
        });

        // If our exact event actually exists (common when caller raced and lost response)
        if (head?.seq === computed.seq && head?.idempotencyKey === idempotencyKey) {
          return { status: 200, event: head };
        }

        return { status: 409, code: "STALE_EXPECTED_SEQ", head };
      }

      // Unknown unique target: rethrow (surface as 500) so you notice schema drift
      throw e;
    }
  });
}
