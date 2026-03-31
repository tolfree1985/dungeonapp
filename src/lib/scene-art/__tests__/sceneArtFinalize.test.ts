import { describe, expect, test } from 'vitest';
import { SceneArtStatus } from '@prisma/client';
import { finalizeSceneArtExecution, type SceneArtExecutionResult } from '../scene-art/sceneArtFinalize';

const baseRow = {
  status: SceneArtStatus.generating,
  attemptCount: 1,
  lastProviderRetryable: true,
};

const now = new Date('2026-01-01T00:00:00Z');

describe('finalizeSceneArtExecution', () => {
  test('success transitions to ready', () => {
    const result: SceneArtExecutionResult = {
      kind: 'success',
      imagePath: '/scene-art/ready.png',
    };

    const decision = finalizeSceneArtExecution({ row: baseRow, result, now });

    expect(decision.nextStatus).toBe(SceneArtStatus.ready);
    expect(decision.clearLease).toBe(true);
    expect(decision.generationCompletedAt).toEqual(now);
    expect(decision.nextRetryAt).toBeNull();
  });

  test('retryable failure requeues under budget', () => {
    const result: SceneArtExecutionResult = {
      kind: 'failure',
      retryable: true,
      retryDelayMs: 5000,
      errorCode: 'SCENE_ART_TIMEOUT',
      errorMessage: 'timeout',
    };

    const decision = finalizeSceneArtExecution({ row: { ...baseRow, attemptCount: 1 }, result, now });

    expect(decision.nextStatus).toBe(SceneArtStatus.queued);
    expect(decision.nextRetryAt).toEqual(new Date(now.getTime() + 5000));
    expect(decision.errorCode).toBe('SCENE_ART_TIMEOUT');
  });

  test('retryable failure over budget becomes failed', () => {
    const result: SceneArtExecutionResult = {
      kind: 'failure',
      retryable: true,
      retryDelayMs: 5000,
    };

    const decision = finalizeSceneArtExecution({ row: { ...baseRow, attemptCount: 3 }, result, now });

    expect(decision.nextStatus).toBe(SceneArtStatus.failed);
    expect(decision.nextRetryAt).toBeNull();
  });

  test('non-retryable failure becomes failed immediately', () => {
    const result: SceneArtExecutionResult = {
      kind: 'failure',
      retryable: false,
      retryDelayMs: null,
    };

    const decision = finalizeSceneArtExecution({ row: baseRow, result, now });

    expect(decision.nextStatus).toBe(SceneArtStatus.failed);
    expect(decision.nextRetryAt).toBeNull();
  });
});
