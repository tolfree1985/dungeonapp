export type TurnResolutionOutcome =
  | "SUCCESS"
  | "SUCCESS_WITH_COST"
  | "SUCCESS_WITH_COMPLICATION"
  | "FAIL_FORWARD"
  | "FAILURE";

export type TurnResolutionPresentation = {
  outcome: TurnResolutionOutcome;
  rollLabel: string | null;
  resultLabel: string | null;
};

export type BuildTurnResolutionPresentationInput = {
  outcome: TurnResolutionOutcome;
  rollTotal?: number | null;
  resultLabel?: string | null;
};

/**
 * Resolution presentation is a deterministic materialization of the finalized outcome metadata.
 * It must be derivable from the finalized turn result and must not inspect UI state or reconstruct meaning from narration.
 */
export function buildTurnResolutionPresentation(
  input: BuildTurnResolutionPresentationInput
): TurnResolutionPresentation {
  return {
    outcome: input.outcome,
    rollLabel:
      input.rollTotal == null ? null : `Roll: 2d6 → ${input.rollTotal}`,
    resultLabel: input.resultLabel ?? null,
  };
}
