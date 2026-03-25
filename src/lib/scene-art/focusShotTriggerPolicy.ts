
export type FocusShotReason =
  | "artifact_revealed"
  | "major_reveal"
  | "legendary_item_revealed"
  | "boss_reveal";

export type FocusShotTier = "medium" | "high";

export type FocusShotVisualState = {
  visualMilestones: string[];
};

export type FocusShotTriggerDecision = {
  shouldGenerate: boolean;
  tier: FocusShotTier | null;
  reason: FocusShotReason | null;
  milestoneKind: FocusShotReason | null;
};

const milestoneTierMap: Record<FocusShotReason, FocusShotTier> = {
  artifact_revealed: "medium",
  major_reveal: "medium",
  legendary_item_revealed: "high",
  boss_reveal: "high",
};

export function decideFocusShotTrigger(
  previous: FocusShotVisualState,
  next: FocusShotVisualState,
): FocusShotTriggerDecision {
  const newMilestones = next.visualMilestones.filter((m) => !previous.visualMilestones.includes(m));
  for (const milestone of newMilestones) {
    const tier = milestoneTierMap[milestone as FocusShotReason];
    if (tier) {
      return {
        shouldGenerate: true,
        tier,
        reason: milestone as FocusShotReason,
        milestoneKind: milestone as FocusShotReason,
      };
    }
  }
  return { shouldGenerate: false, tier: null, reason: null, milestoneKind: null };
}
