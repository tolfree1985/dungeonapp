export type PositionPenaltyEffect = "position.worsened" | "position.exposed";

export function resolvePositionPenaltyEffect(positionPenalty: number): PositionPenaltyEffect | null {
  if (positionPenalty >= 2) return "position.exposed";
  if (positionPenalty >= 1) return "position.worsened";
  return null;
}
