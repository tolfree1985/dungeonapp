import type { SceneArt } from '@prisma/client';
import type { SceneArtStatusLiteral } from '@/lib/scene-art/sceneArtStatus';

const MAX_ATTEMPTS = 3;

export type SceneArtExecutionResult =
  | {
      kind: 'success';
      imagePath: string;
      providerAssetUrl?: string | null;
      providerMeta?: Record<string, unknown> | null;
    }
  | {
      kind: 'failure';
      retryable: boolean;
      retryDelayMs: number | null;
      errorCode?: string | null;
      errorMessage?: string | null;
      failureClass?: string | null;
      providerMeta?: Record<string, unknown> | null;
    };

export type SceneArtFinalizeDecision = {
  nextStatus: SceneArtStatusLiteral;
  clearLease: boolean;
  incrementAttemptCount: boolean;
  nextRetryAt: Date | null;
  generationCompletedAt: Date | null;
  errorCode: string | null;
  errorMessage: string | null;
};

type FinalizeInput = {
  row: Pick<
    SceneArt,
    'status' | 'attemptCount' | 'lastProviderRetryable'
  >;
  result: SceneArtExecutionResult;
  now: Date;
};

export function finalizeSceneArtExecution({ row, result, now }: FinalizeInput): SceneArtFinalizeDecision {
  if (result.kind === 'success') {
    const decision: SceneArtFinalizeDecision = {
      nextStatus: 'ready',
      clearLease: true,
      incrementAttemptCount: false,
      nextRetryAt: null,
      generationCompletedAt: now,
      errorCode: null,
      errorMessage: null,
    };
    assertValidSceneArtTransition(row.status, decision.nextStatus, false);
    return decision;
  }

  const attemptCount = row.attemptCount ?? 0;
  const nextRetryAt = computeSceneArtBackoff(attemptCount, now, result.retryDelayMs);
  const retryAllowed = result.retryable && attemptCount < MAX_ATTEMPTS;

  if (!retryAllowed) {
    const decision: SceneArtFinalizeDecision = {
      nextStatus: 'failed',
      clearLease: true,
      incrementAttemptCount: false,
      nextRetryAt: null,
      generationCompletedAt: now,
      errorCode: result.errorCode ?? 'SCENE_ART_PROVIDER_FAILURE',
      errorMessage: result.errorMessage ?? 'Scene art generation failed',
    };
    assertValidSceneArtTransition(row.status, decision.nextStatus, retryAllowed);
    return decision;
  }

  const decision: SceneArtFinalizeDecision = {
    nextStatus: 'queued',
    clearLease: true,
    incrementAttemptCount: false,
    nextRetryAt,
    generationCompletedAt: null,
    errorCode: result.errorCode ?? 'SCENE_ART_PROVIDER_RETRYABLE_FAILURE',
    errorMessage: result.errorMessage ?? 'Scene art generation retry scheduled',
  };
  assertValidSceneArtTransition(row.status, decision.nextStatus, retryAllowed);
  return decision;
}

function computeSceneArtBackoff(attemptCount: number, now: Date, overrideDelayMs: number | null): Date | null {
  if (overrideDelayMs === null) return null;
  const delaySeconds = Math.min(60 * 10, overrideDelayMs / 1000 || 15 * 2 ** Math.max(0, attemptCount - 1));
  return new Date(now.getTime() + delaySeconds * 1000);
}

function assertValidSceneArtTransition(
  from: SceneArtStatusLiteral,
  to: SceneArtStatusLiteral,
  retryAllowed: boolean,
): void {
  if (from === 'ready' && to !== 'ready') {
    throw new Error(`scene-art: ready rows must be terminal (attempted ${from} -> ${to})`);
  }

  if (from === 'failed' && to === 'queued' && !retryAllowed) {
    throw new Error(
      `scene-art: terminal failed rows cannot requeue without retry allowance (retryAllowed=${retryAllowed})`,
    );
  }
}
