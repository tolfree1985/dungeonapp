export type ComplicationRiskEffect = {
  complicationLikely: boolean;
};

export function resolveComplicationRiskEffect(params: {
  higherComplicationRisk: boolean;
}): ComplicationRiskEffect {
  return {
    complicationLikely: params.higherComplicationRisk,
  };
}
