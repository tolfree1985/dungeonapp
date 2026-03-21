export type ComplicationWeightResult = {
  complicationWeightDelta: number;
};

export function resolveComplicationWeight(params: { actionRiskDelta: number }): ComplicationWeightResult {
  return { complicationWeightDelta: params.actionRiskDelta };
}
