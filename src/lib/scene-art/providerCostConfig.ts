export type SceneArtCostTier = "low" | "medium" | "high";

export type SceneArtAttemptCost = {
  providerModel: string;
  attemptCostUsd: number;
  costTier: SceneArtCostTier;
};

type SceneArtProviderCostConfig = {
  providerModel: string;
  defaultTier: SceneArtCostTier;
  lowCostPerAttemptUsd: number;
  mediumCostPerAttemptUsd: number;
  highCostPerAttemptUsd: number;
};

function getSceneArtProviderCostConfig(): SceneArtProviderCostConfig {
  const providerModel = process.env.SCENE_ART_PROVIDER_MODEL ?? "gpt-image-1";
  const defaultTier = (process.env.SCENE_ART_COST_TIER as SceneArtCostTier) ?? "low";
  const lowCostPerAttemptUsd = Number(process.env.SCENE_ART_LOW_COST_PER_ATTEMPT_USD ?? process.env.SCENE_ART_COST_PER_ATTEMPT_USD ?? "0.01");
  const mediumCostPerAttemptUsd = Number(process.env.SCENE_ART_MEDIUM_COST_PER_ATTEMPT_USD ?? lowCostPerAttemptUsd);
  const highCostPerAttemptUsd = Number(process.env.SCENE_ART_HIGH_COST_PER_ATTEMPT_USD ?? mediumCostPerAttemptUsd);

  return {
    providerModel,
    defaultTier,
    lowCostPerAttemptUsd,
    mediumCostPerAttemptUsd,
    highCostPerAttemptUsd,
  };
}

export function resolveSceneArtAttemptCost(tier?: SceneArtCostTier): SceneArtAttemptCost {
  const config = getSceneArtProviderCostConfig();
  const resolvedTier = tier ?? config.defaultTier;
  const costs: Record<SceneArtCostTier, number> = {
    low: config.lowCostPerAttemptUsd,
    medium: config.mediumCostPerAttemptUsd,
    high: config.highCostPerAttemptUsd,
  };
  const attemptCostUsd = costs[resolvedTier];
  return {
    providerModel: config.providerModel,
    costTier: resolvedTier,
    attemptCostUsd,
  };
}
