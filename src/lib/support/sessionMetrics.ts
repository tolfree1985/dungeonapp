import {
  applyDifficultyMomentumStep,
  classifyConsequence,
  classifyDifficultyTier,
  classifyFailForwardSignal,
  deriveCapSnapshot,
  type CapReason,
  type ConsequenceEscalation,
  type ConsequenceRiskLevel,
  type DifficultyTier,
  type FailForwardSignal,
  type ReplayWithGuardSummary,
} from "../game/replay";

type ReplayEventLike = { seq: number; turnJson: unknown };

type OutcomeBand = "success" | "mixed" | "fail";

export type SessionMetricsV1 = {
  version: 1;
  turns: number;
  failures: number;
  successes: number;
  mixed: number;
  riskCounts: Record<ConsequenceRiskLevel, number>;
  escalationCounts: Record<ConsequenceEscalation, number>;
  capCounts: Record<CapReason, number>;
  difficultyTiers: Record<DifficultyTier, number>;
  failForwardSignals: Record<FailForwardSignal, number>;
  causalCoverage: {
    totalDeltas: number;
    unexplainedDeltas: number;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readResolutionBand(turnJson: unknown): OutcomeBand {
  const root = isRecord(turnJson) ? turnJson : {};
  const resolution = isRecord(root.resolution) ? root.resolution : {};
  const totalRaw = resolution.total;
  if (typeof totalRaw === "number" && Number.isFinite(totalRaw)) {
    if (totalRaw >= 10) return "success";
    if (totalRaw >= 7) return "mixed";
    return "fail";
  }

  const candidates = [
    resolution.tier,
    resolution.outcome,
    resolution.band,
    root.outcome,
    root.tier,
    root.band,
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const normalized = candidate.trim().toLowerCase();
    if (!normalized) continue;
    if (
      normalized === "success" ||
      normalized === "hit" ||
      normalized === "pass" ||
      normalized === "10-12" ||
      normalized === "10+"
    ) {
      return "success";
    }
    if (
      normalized === "mixed" ||
      normalized === "cost" ||
      normalized === "partial" ||
      normalized === "7-9"
    ) {
      return "mixed";
    }
    if (
      normalized === "fail" ||
      normalized === "failure" ||
      normalized === "fail-forward" ||
      normalized === "2-6" ||
      normalized.includes("fail")
    ) {
      return "fail";
    }
  }

  return "success";
}

function readDeltaCount(turnJson: unknown): number {
  const root = isRecord(turnJson) ? turnJson : {};
  const deltas = Array.isArray(root.deltas)
    ? root.deltas
    : Array.isArray(root.stateDeltas)
      ? root.stateDeltas
      : [];
  return deltas.length;
}

export function deriveSessionMetrics(
  events: ReplayEventLike[],
  replayOutputs: Pick<ReplayWithGuardSummary, "difficultyState" | "causalCoverage"> | null,
): SessionMetricsV1 {
  const riskCounts: Record<ConsequenceRiskLevel, number> = {
    LOW: 0,
    MODERATE: 0,
    HIGH: 0,
  };
  const escalationCounts: Record<ConsequenceEscalation, number> = {
    NONE: 0,
    MINOR: 0,
    MAJOR: 0,
  };
  const capCounts: Record<CapReason, number> = {
    NONE: 0,
    OUTPUT_TRUNCATED: 0,
    OPTIONS_TRUNCATED: 0,
    LEDGER_TRUNCATED: 0,
    DELTA_TRUNCATED: 0,
  };
  const difficultyTiers: Record<DifficultyTier, number> = {
    CALM: 0,
    TENSE: 0,
    DANGEROUS: 0,
    CRITICAL: 0,
  };
  const failForwardSignals: Record<FailForwardSignal, number> = {
    STATE_DELTA: 0,
    QUEST_ADVANCE: 0,
    FLAG_SET: 0,
    RELATIONSHIP_SHIFT: 0,
    SYSTEM_NO_LEDGER: 0,
  };

  let successes = 0;
  let mixed = 0;
  let failures = 0;
  let lowSuccessStreak = 0;
  let momentum = 0;

  const sortedEvents = [...events].sort((a, b) => a.seq - b.seq);
  sortedEvents.forEach((event, index) => {
    const band = readResolutionBand(event.turnJson);
    if (band === "success") successes += 1;
    else if (band === "mixed") mixed += 1;
    else failures += 1;

    const consequence = classifyConsequence(event.turnJson);
    riskCounts[consequence.riskLevel] += 1;
    escalationCounts[consequence.escalation] += 1;

    const cap = deriveCapSnapshot(event.turnJson);
    capCounts[cap.capReason] += 1;

    const signal = classifyFailForwardSignal(event.turnJson);
    if (signal) {
      failForwardSignals[signal] += 1;
    }

    let tierForTurn: DifficultyTier;
    if (replayOutputs && index < replayOutputs.difficultyState.curve.length) {
      tierForTurn = classifyDifficultyTier(replayOutputs.difficultyState.curve[index]);
    } else {
      const step = applyDifficultyMomentumStep(
        momentum,
        {
          riskLevel: consequence.riskLevel,
          escalation: consequence.escalation,
          isFailure: band === "fail",
          isSuccessBand: band === "success",
        },
        lowSuccessStreak,
      );
      momentum = step.momentum;
      lowSuccessStreak = step.lowSuccessStreak;
      tierForTurn = classifyDifficultyTier(momentum);
    }
    difficultyTiers[tierForTurn] += 1;
  });

  const fallbackTotalDeltas = sortedEvents.reduce((sum, event) => sum + readDeltaCount(event.turnJson), 0);
  const totalDeltas = replayOutputs?.causalCoverage.totalDeltas ?? fallbackTotalDeltas;
  const unexplainedDeltas = replayOutputs?.causalCoverage.unexplainedDeltas ?? 0;

  return {
    version: 1,
    turns: sortedEvents.length,
    failures,
    successes,
    mixed,
    riskCounts,
    escalationCounts,
    capCounts,
    difficultyTiers,
    failForwardSignals,
    causalCoverage: {
      totalDeltas,
      unexplainedDeltas,
    },
  };
}

export function serializeSessionMetrics(metrics: SessionMetricsV1): string {
  const ordered: SessionMetricsV1 = {
    version: 1,
    turns: metrics.turns,
    failures: metrics.failures,
    successes: metrics.successes,
    mixed: metrics.mixed,
    riskCounts: {
      LOW: metrics.riskCounts.LOW,
      MODERATE: metrics.riskCounts.MODERATE,
      HIGH: metrics.riskCounts.HIGH,
    },
    escalationCounts: {
      NONE: metrics.escalationCounts.NONE,
      MINOR: metrics.escalationCounts.MINOR,
      MAJOR: metrics.escalationCounts.MAJOR,
    },
    capCounts: {
      NONE: metrics.capCounts.NONE,
      OUTPUT_TRUNCATED: metrics.capCounts.OUTPUT_TRUNCATED,
      OPTIONS_TRUNCATED: metrics.capCounts.OPTIONS_TRUNCATED,
      LEDGER_TRUNCATED: metrics.capCounts.LEDGER_TRUNCATED,
      DELTA_TRUNCATED: metrics.capCounts.DELTA_TRUNCATED,
    },
    difficultyTiers: {
      CALM: metrics.difficultyTiers.CALM,
      TENSE: metrics.difficultyTiers.TENSE,
      DANGEROUS: metrics.difficultyTiers.DANGEROUS,
      CRITICAL: metrics.difficultyTiers.CRITICAL,
    },
    failForwardSignals: {
      STATE_DELTA: metrics.failForwardSignals.STATE_DELTA,
      QUEST_ADVANCE: metrics.failForwardSignals.QUEST_ADVANCE,
      FLAG_SET: metrics.failForwardSignals.FLAG_SET,
      RELATIONSHIP_SHIFT: metrics.failForwardSignals.RELATIONSHIP_SHIFT,
      SYSTEM_NO_LEDGER: metrics.failForwardSignals.SYSTEM_NO_LEDGER,
    },
    causalCoverage: {
      totalDeltas: metrics.causalCoverage.totalDeltas,
      unexplainedDeltas: metrics.causalCoverage.unexplainedDeltas,
    },
  };
  return JSON.stringify(ordered);
}
