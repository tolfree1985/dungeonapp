export const TURN_OUTCOMES = [
  "SUCCESS",
  "SUCCESS_WITH_COST",
  "FAIL_FORWARD",
] as const;

export type TurnOutcome = (typeof TURN_OUTCOMES)[number];

export function assertTurnOutcome(value: unknown): TurnOutcome {
  if (
    value !== "SUCCESS" &&
    value !== "SUCCESS_WITH_COST" &&
    value !== "FAIL_FORWARD"
  ) {
    throw new Error(`Invalid turn outcome: ${String(value)}`);
  }
  return value;
}
