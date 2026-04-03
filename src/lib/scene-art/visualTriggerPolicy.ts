import type { SceneDeltaKind } from "@/lib/resolveSceneDeltaKind";

export type SceneArtTriggerReason =
  | "location_entered"
  | "pressure_band_changed"
  | "encounter_state_changed"
  | "visual_milestone";

export type SceneArtTriggerTier = "low" | "medium" | "high";

export type SceneArtTriggerDecision = {
  shouldGenerate: boolean;
  tier: SceneArtTriggerTier | null;
  reason: SceneArtTriggerReason | null;
  milestoneKind?: string | null;
  deltaKind?: SceneDeltaKind | null;
};

export type SceneArtVisualState = {
  location: string;
  pressureBand: string;
  encounterState: string;
  visualMilestones: string[];
  importantObjectInspected: boolean;
};

const milestoneTierMap: Record<string, SceneArtTriggerTier> = {
  artifact_discovered: "medium",
  major_reveal: "medium",
  legendary_item_revealed: "high",
};

export function decideSceneArtVisualTrigger(
  previous: SceneArtVisualState,
  next: SceneArtVisualState,
): SceneArtTriggerDecision {
  if (previous.location !== next.location) {
    return { shouldGenerate: true, tier: "low", reason: "location_entered" };
  }

  if (previous.pressureBand !== next.pressureBand) {
    return { shouldGenerate: true, tier: "medium", reason: "pressure_band_changed" };
  }

  if (previous.encounterState !== next.encounterState) {
    return { shouldGenerate: true, tier: "medium", reason: "encounter_state_changed" };
  }

  const newMilestones = next.visualMilestones.filter((m) => !previous.visualMilestones.includes(m));
  for (const milestone of newMilestones) {
    const tier = milestoneTierMap[milestone];
    if (tier) {
      return {
        shouldGenerate: true,
        tier,
        reason: "visual_milestone",
        milestoneKind: milestone,
      };
    }
  }

  if (next.importantObjectInspected && !previous.importantObjectInspected) {
    return { shouldGenerate: false, tier: null, reason: null };
  }

  return { shouldGenerate: false, tier: null, reason: null };
}
