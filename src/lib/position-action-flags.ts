export type PositionActionFlags = {
  mobilityDisadvantage: boolean;
  coverLost: boolean;
};

export function resolvePositionActionFlags(positionPenalty: number): PositionActionFlags {
  return {
    mobilityDisadvantage: positionPenalty >= 1,
    coverLost: positionPenalty >= 2,
  };
}
