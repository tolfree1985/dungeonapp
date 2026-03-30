import { SceneArtStatus } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import {
  SceneArtRowForClaim,
  getLeaseDurationMs,
  isSceneArtClaimableNow,
} from "./sceneArtLease";

type SceneArtCandidate = SceneArtRowForClaim & {
  id: string;
  sceneKey: string;
  promptHash: string;
  basePrompt: string;
  renderPrompt: string;
  stylePreset: string | null;
  renderMode: "full" | "partial";
  engineVersion: string | null;
  generationStartedAt: Date | null;
};

export type ClaimedSceneArtJob = {
  id: string;
  sceneKey: string;
  promptHash: string;
  basePrompt: string;
  renderPrompt: string;
  stylePreset: string | null;
  renderMode: "full" | "partial";
  engineVersion: string | null;
  generationLeaseUntil: Date | null;
  leaseAcquiredAt: Date | null;
  generationStartedAt: Date | null;
};

const CLAIM_ATTEMPT_LIMIT = 3;
const BILLABLE_ATTEMPT_LIMIT = 2;

export async function claimNextSceneArtForRender(
  now: Date,
  workerId: string,
): Promise<ClaimedSceneArtJob | null> {
  return prisma.$transaction(async (tx) => {
    const candidate = (await tx.sceneArt.findFirst({
      where: {
        attemptCount: { lt: CLAIM_ATTEMPT_LIMIT },
        billableAttemptCount: { lt: BILLABLE_ATTEMPT_LIMIT },
        OR: [
          { status: SceneArtStatus.queued },
          {
            status: SceneArtStatus.generating,
            OR: [
              { generationLeaseUntil: null },
              { generationLeaseUntil: { lte: now } },
            ],
          },
          {
            status: SceneArtStatus.failed,
            lastProviderRetryable: true,
            OR: [
              { generationLeaseUntil: null },
              { generationLeaseUntil: { lte: now } },
            ],
          },
          {
            status: SceneArtStatus.retryable,
            OR: [
              { generationLeaseUntil: null },
              { generationLeaseUntil: { lte: now } },
            ],
          },
        ],
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        sceneKey: true,
        promptHash: true,
        basePrompt: true,
        renderPrompt: true,
        stylePreset: true,
        renderMode: true,
        engineVersion: true,
        attemptCount: true,
        billableAttemptCount: true,
        generationLeaseUntil: true,
        lastProviderRetryable: true,
      },
    })) as SceneArtCandidate | null;

    if (!candidate || !candidate.sceneKey || !candidate.promptHash) {
      return null;
    }

    if (!isSceneArtClaimableNow(candidate, now)) {
      return null;
    }

    const leaseStartedAt = now;
    const leaseDurationMs = getLeaseDurationMs();
    const leaseUntil = new Date(leaseStartedAt.getTime() + leaseDurationMs);
    const leased = await tx.sceneArt.update({
      where: {
        id: candidate.id,
        status: { not: SceneArtStatus.ready },
      },
      data: {
        status: SceneArtStatus.generating,
        leaseOwnerId: workerId,
        leaseAcquiredAt: leaseStartedAt,
        generationStartedAt: leaseStartedAt,
        generationLeaseUntil: leaseUntil,
        attemptCount: { increment: 1 },
      },
      select: {
        id: true,
        sceneKey: true,
        promptHash: true,
        basePrompt: true,
        renderPrompt: true,
        stylePreset: true,
        renderMode: true,
        engineVersion: true,
        generationLeaseUntil: true,
        leaseAcquiredAt: true,
        generationStartedAt: true,
      },
    });

    return leased;
  });
}
