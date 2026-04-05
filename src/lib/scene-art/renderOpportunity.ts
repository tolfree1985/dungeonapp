export type SceneRenderReason =
  | "NONE"
  | "NEW_SCENE"
  | "VISIBLE_DISRUPTION"
  | "MAJOR_ENVIRONMENT_CHANGE"
  | "MAJOR_REVEAL"
  | "ANCHOR_MOMENT";

export type SceneArtStatus = "queued" | "generating" | "ready" | "failed";

export type SceneArtContract = {
  sceneKey: string | null;
  promptHash: string | null;
  status: SceneArtStatus | null;
  imageUrl: string | null;
};

export type SceneRenderOpportunity = {
  canGenerate: boolean;
  autoRender: boolean;
  reason: SceneRenderReason;
  sceneKey: string | null;
  promptHash: string | null;
  estimatedCostTier: "low" | "medium" | "high" | null;
  label: string | null;
};

export function isAutoRenderReason(reason: SceneRenderReason): boolean {
  return reason === "ANCHOR_MOMENT" || reason === "MAJOR_REVEAL";
}

export function mapTriggerReason(input: {
  shouldGenerate: boolean;
  reason?: string | null;
}): SceneRenderReason {
  if (!input.shouldGenerate) return "NONE";

  switch (input.reason) {
    case "VISIBLE_DISRUPTION":
      return "VISIBLE_DISRUPTION";
    case "MAJOR_ENVIRONMENT_CHANGE":
      return "MAJOR_ENVIRONMENT_CHANGE";
    case "MAJOR_REVEAL":
      return "MAJOR_REVEAL";
    case "ANCHOR_MOMENT":
      return "ANCHOR_MOMENT";
    case "NEW_SCENE":
      return "NEW_SCENE";
    default:
      return "NEW_SCENE";
  }
}

export function mapSceneRenderOpportunity(args: {
  canGenerate: boolean;
  reason: SceneRenderReason;
  sceneKey: string | null;
  promptHash: string | null;
  estimatedCostTier: "low" | "medium" | "high" | null;
}): SceneRenderOpportunity {
  const autoRender = args.canGenerate && isAutoRenderReason(args.reason);

  return {
    canGenerate: args.canGenerate,
    autoRender,
    reason: args.canGenerate ? args.reason : "NONE",
    sceneKey: args.sceneKey,
    promptHash: args.promptHash,
    estimatedCostTier: args.canGenerate ? args.estimatedCostTier : null,
    label: args.canGenerate && !autoRender ? "Render Scene" : null,
  };
}
