export type ResolutionCostEffect = {
  higherComplicationRisk: boolean;
};

export function resolveResolutionCostEffect(params: {
  resolutionCost: number;
}): ResolutionCostEffect {
  return {
    higherComplicationRisk: params.resolutionCost > 0,
  };
}
