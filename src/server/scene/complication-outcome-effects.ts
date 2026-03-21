export type ComplicationOutcomeEffect = {
  minimumComplicationCount: number;
};

export function resolveComplicationOutcomeEffect(params: {
  complicationLikely: boolean;
}): ComplicationOutcomeEffect {
  return {
    minimumComplicationCount: params.complicationLikely ? 1 : 0,
  };
}
