export type NoiseActionFlags = {
  attentionDrawn: boolean;
  searchPressure: boolean;
};

export function resolveNoiseActionFlags(noise: number): NoiseActionFlags {
  return {
    attentionDrawn: noise >= 1,
    searchPressure: noise >= 2,
  };
}
