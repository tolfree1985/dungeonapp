import { createHash } from "node:crypto";
import type { SceneFramingState } from "@/lib/resolveSceneFramingState";
import type { SceneSubjectState } from "@/lib/resolveSceneSubjectState";

type CanonicalShotValue = string | null;

export type SceneShotIdentity = {
  frameKind: SceneFramingState["frameKind"] | null;
  shotScale: SceneFramingState["shotScale"] | null;
  cameraAngle: SceneFramingState["cameraAngle"] | null;
  subjectFocus: SceneFramingState["subjectFocus"] | null;
  primarySubjectId: SceneSubjectState["primarySubjectId"] | null;
};

function normalizeShotValue(value: CanonicalShotValue) {
  if (!value) return "";
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");
}

export function buildSceneShotKey(identity: SceneShotIdentity): string {
  const canonical = {
    frameKind: normalizeShotValue(identity.frameKind),
    shotScale: normalizeShotValue(identity.shotScale),
    cameraAngle: normalizeShotValue(identity.cameraAngle),
    subjectFocus: normalizeShotValue(identity.subjectFocus),
    primarySubjectId: normalizeShotValue(identity.primarySubjectId),
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}
