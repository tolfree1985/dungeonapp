import { prisma } from "@/lib/prisma";
import { SceneArtStatus } from "@/generated/prisma";
import { getSceneArtIdentity } from "@/lib/sceneArtIdentity";
import { assertStoredSceneArtMatchesIdentity } from "@/lib/scene-art/assertStoredSceneArtMatchesIdentity";
import { sceneArtFileExists } from "@/lib/scene-art/fileSystem";
import { generateSceneArtForIdentity } from "@/lib/scene-art/generateSceneArtForIdentity";
import { deleteSceneArtFileIfPresent } from "@/lib/scene-art/deleteSceneArtFileIfPresent";

/**
 * Recovery rules:
 * - identity fields must remain unchanged
 * - clear-and-regenerate may delete only the deterministic artifact file
 * - DB row must never be deleted
 * - generation must reuse the shared generation helper
 */
export type RecoverSceneArtAction = "retry" | "force-regenerate" | "clear-and-regenerate";

export type RecoverSceneArtInput = {
  action: RecoverSceneArtAction;
  sceneKey: string;
  sceneText: string;
  stylePreset?: string | null;
  renderMode?: "full" | "preview";
};

export type RecoverSceneArtResult = {
  status: "pending" | "generating" | "ready" | "failed" | "missing";
  promptHash: string;
  imageUrl: string | null;
};

export class SceneArtRecoveryError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export async function recoverSceneArt(
  input: RecoverSceneArtInput,
): Promise<RecoverSceneArtResult> {
  if (input.action !== "retry" && input.action !== "force-regenerate" && input.action !== "clear-and-regenerate") {
    throw new SceneArtRecoveryError(
      "SCENE_ART_UNSUPPORTED_RECOVERY_ACTION",
      `Unsupported recovery action: ${input.action}`,
    );
  }

  const identity = getSceneArtIdentity({
    sceneKey: input.sceneKey,
    sceneText: input.sceneText,
    stylePreset: input.stylePreset ?? null,
    renderMode: input.renderMode ?? "full",
  });

  const row = await prisma.sceneArt.findUnique({
    where: {
      sceneKey_promptHash: {
        sceneKey: identity.sceneKey,
        promptHash: identity.promptHash,
      },
    },
  });

  if (!row) {
    throw new SceneArtRecoveryError(
      "SCENE_ART_RECOVERY_ROW_NOT_FOUND",
      "No scene art row found for retry",
      404,
    );
  }

  assertStoredSceneArtMatchesIdentity(row, identity);

  const isFailed = row.status === SceneArtStatus.failed;
  const isReady = row.status === SceneArtStatus.ready;
  const missingFile = isReady && (!row.imageUrl || !(await sceneArtFileExists(row.imageUrl)));
  const isMissing = missingFile;

  if (input.action === "retry") {
    if (!isFailed && !isMissing) {
      throw new SceneArtRecoveryError(
        "SCENE_ART_RECOVERY_INVALID_STATE",
        `Retry not allowed from status: ${row.status}`,
        409,
      );
    }
  }

  if (input.action === "force-regenerate") {
    if (!isFailed && !isMissing && !isReady) {
      throw new SceneArtRecoveryError(
        "SCENE_ART_RECOVERY_INVALID_STATE",
        `Force regenerate not allowed from status: ${row.status}`,
        409,
      );
    }
  }

  if (input.action === "clear-and-regenerate") {
    if (!isFailed && !isMissing && !isReady) {
      throw new SceneArtRecoveryError(
        "SCENE_ART_RECOVERY_INVALID_STATE",
        `Clear and regenerate not allowed from status: ${row.status}`,
        409,
      );
    }
    await deleteSceneArtFileIfPresent(identity.imageUrl);
  }

  await prisma.sceneArt.update({
    where: {
      sceneKey_promptHash: {
        sceneKey: identity.sceneKey,
        promptHash: identity.promptHash,
      },
    },
    data: {
      status: SceneArtStatus.queued,
      tagsJson: null,
    },
  });

  const updated = await generateSceneArtForIdentity(identity, { force: true });

  return {
    status: normalizePresentationStatus(updated.status),
    promptHash: updated.promptHash,
    imageUrl: updated.status === SceneArtStatus.ready ? updated.imageUrl : null,
  };
}

function normalizePresentationStatus(rawStatus: SceneArtStatus): RecoverSceneArtResult["status"] {
  switch (rawStatus) {
    case SceneArtStatus.queued:
      return "pending";
    case SceneArtStatus.ready:
      return "ready";
    case SceneArtStatus.failed:
      return "failed";
    default:
      throw new SceneArtRecoveryError(
        "SCENE_ART_UNKNOWN_STATUS",
        `Unknown scene art status: ${rawStatus}`,
        500,
      );
  }
}
