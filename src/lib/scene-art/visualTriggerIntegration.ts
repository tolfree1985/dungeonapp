import { DEFAULT_STYLE_PRESET } from "@/lib/sceneArt";
import type { SceneIdentity } from "@/server/scene/scene-identity";
import { decideSceneArtVisualTrigger, type SceneArtTriggerDecision, type SceneArtVisualState } from "@/lib/scene-art/visualTriggerPolicy";
import { logSceneArtEvent } from "@/lib/scene-art/logging";
import { queueSceneArtGeneration } from "@/lib/scene-art/queueSceneArtGeneration";
import { getSceneArtIdentity, type SceneArtIdentityInput } from "@/lib/sceneArtIdentity";

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => asString(entry)).filter((entry): entry is string => Boolean(entry));
}

function deriveLocation(record: Record<string, unknown> | null, identity: SceneIdentity | null): string {
  const scene = asRecord(record?.scene);
  return (
    asString(scene.locationKey) ??
    asString(scene.location) ??
    asString(record?.location) ??
    identity?.locationKey ??
    "unknown"
  );
}

function derivePressureBand(record: Record<string, unknown> | null): string {
  const scene = asRecord(record?.scene);
  return (
    asString(record?.pressureBand) ??
    asString(scene.pressureBand) ??
    asString(record?.pressureStage) ??
    asString(record?.pressure?.band) ??
    asString(record?.pressure) ??
    "calm"
  );
}

function deriveEncounterState(identity: SceneIdentity | null): string {
  return identity?.encounterPhase ?? "investigation";
}

function deriveVisualMilestones(record: Record<string, unknown> | null): string[] {
  const explicit = asStringArray(record?.visualMilestones ?? record?.milestones);
  return explicit;
}

function deriveImportantObjectInspection(record: Record<string, unknown> | null): boolean {
  return Boolean(record?.importantObjectInspected ?? record?.lastImportantObjectInspected ?? record?.importantObject ?? false);
}

function deriveVisualStateFromRecord(
  record: Record<string, unknown> | null,
  identity: SceneIdentity | null,
): SceneArtVisualState {
  return {
    location: deriveLocation(record, identity),
    pressureBand: derivePressureBand(record),
    encounterState: deriveEncounterState(identity),
    visualMilestones: deriveVisualMilestones(record),
    importantObjectInspected: deriveImportantObjectInspection(record),
  };
}

export type SceneArtTriggerEvaluationOptions = {
  previousState: Record<string, unknown> | null;
  currentState: Record<string, unknown> | null;
  previousIdentity: SceneIdentity | null;
  currentIdentity: SceneIdentity;
  sceneKey: string;
  sceneText?: string | null;
  stylePreset?: string | null;
  renderMode?: "full" | "partial";
  engineVersion?: string | null;
};

export async function evaluateSceneArtVisualTrigger(
  options: SceneArtTriggerEvaluationOptions,
): Promise<SceneArtTriggerDecision> {
  const previousVisualState = deriveVisualStateFromRecord(options.previousState, options.previousIdentity);
  const currentVisualState = deriveVisualStateFromRecord(options.currentState, options.currentIdentity);
  const triggerDecision = decideSceneArtVisualTrigger(previousVisualState, currentVisualState);

  const identityInput: SceneArtIdentityInput = {
    sceneKey: options.sceneKey,
    sceneText: options.sceneText ?? null,
    stylePreset: options.stylePreset ?? DEFAULT_STYLE_PRESET,
    renderMode: options.renderMode ?? "full",
    engineVersion: options.engineVersion ?? null,
  };
  const identity = getSceneArtIdentity(identityInput);
  logSceneArtEvent("scene.art.trigger", {
    sceneKey: identity.sceneKey,
    promptHash: identity.promptHash,
    shouldGenerate: triggerDecision.shouldGenerate,
    reason: triggerDecision.reason,
    tier: triggerDecision.tier,
  });

  if (!triggerDecision.shouldGenerate) {
    return triggerDecision;
  }

  await queueSceneArtGeneration(identityInput);
  logSceneArtEvent("scene.art.triggered", {
    sceneKey: identity.sceneKey,
    promptHash: identity.promptHash,
    triggerReason: triggerDecision.reason,
    triggerTier: triggerDecision.tier,
    triggerMilestoneKind: triggerDecision.milestoneKind ?? null,
  });
  return triggerDecision;
}
