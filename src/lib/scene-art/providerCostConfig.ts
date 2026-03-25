export type SceneArtAttemptCost = {
  providerModel: string;
  attemptCostUsd: number;
};

export function resolveSceneArtAttemptCost(): SceneArtAttemptCost {
  const attemptCostUsd = Number(process.env.SCENE_ART_COST_PER_ATTEMPT_USD ?? "0.01");
  const providerModel = process.env.SCENE_ART_PROVIDER_MODEL ?? "gpt-image-1";
  return { attemptCostUsd, providerModel };
}
