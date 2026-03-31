import { getSceneArtWorkerRuntimeConfig } from "./workerRuntimeConfig";

export type SceneArtStatus = "queued" | "generating" | "ready" | "failed" | "retryable";

export type SceneArtRowForClaim = {
  status: SceneArtStatus;
  generationLeaseUntil: Date | null;
  lastProviderRetryable: boolean | null;
  attemptCount: number;
  billableAttemptCount: number;
};

export const LEASE_DURATION_MS = 60_000;

export function getLeaseDurationMs(): number {
  return getSceneArtWorkerRuntimeConfig().leaseMs ?? LEASE_DURATION_MS;
}

export function isSceneArtClaimableNow(row: SceneArtRowForClaim, now: Date): boolean {
  if (row.status === "ready") {
    return false;
  }

  if (row.attemptCount >= 3) {
    return false;
  }

  if (row.billableAttemptCount >= 2) {
    return false;
  }

  if (row.status === "queued") {
    return true;
  }

  if (row.status === "generating") {
    return !row.generationLeaseUntil || row.generationLeaseUntil.getTime() <= now.getTime();
  }

  if (row.status === "failed") {
    return (
      row.lastProviderRetryable === true &&
      (!row.generationLeaseUntil || row.generationLeaseUntil.getTime() <= now.getTime())
    );
  }

  if (row.status === "retryable") {
    return !row.generationLeaseUntil || row.generationLeaseUntil.getTime() <= now.getTime();
  }

  return false;
}
