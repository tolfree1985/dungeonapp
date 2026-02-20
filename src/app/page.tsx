"use client";

import { useState } from "react";
import Image from "next/image";
import { ResolutionBadge } from "@/components/ResolutionBadge";
import {
  CONSEQUENCE_RULE_TABLE,
  deriveDifficultyStateFromTurnSignals,
  classifyConsequence,
  deriveCapSnapshot,
  explainConsequence,
  type CapReason,
  type ConsequenceCostType,
  type ConsequenceEscalation,
  type ConsequenceRiskLevel,
} from "@/lib/game/replay";
import styles from "./page.module.css";

type TurnOutcome = "success" | "mixed" | "fail";
type OptionRisk = ConsequenceRiskLevel | "UNKNOWN";
type DemoOption = {
  id: string;
  label: string;
  contextTag?: "hazard" | "social" | "resource" | "neutral";
};

type DemoTurn = {
  id: string;
  playerText: string;
  assistantText: string;
  outcome: TurnOutcome;
  reportedRiskLevel?: ConsequenceRiskLevel;
  stateDeltas: unknown[];
  ledgerAdds: unknown[];
  suggestedOptions: DemoOption[];
  capReason?: CapReason;
};

const COST_TYPE_ICON_MAP: Record<ConsequenceCostType, string> = {
  HEALTH: "❤️",
  RESOURCE: "🧰",
  RELATIONSHIP: "🤝",
  REPUTATION: "🏛️",
  TIME: "⏳",
  FLAG: "⚑",
};

const OPTION_RISK_EXPLANATION_MAP: Record<ConsequenceRiskLevel, string> = {
  LOW: "LOW = minor consequence",
  MODERATE: "MODERATE = complication likely",
  HIGH: "HIGH = serious consequence possible",
};

const ESCALATION_LADDER: ConsequenceEscalation[] = ["NONE", "MINOR", "MAJOR"];
const SESSION_ARC_TURN_THRESHOLD = 10;
const demoSaveSlots: string[] = [];
const EXAMPLE_PROMPTS: readonly string[] = ["Inspect the room", "Ask the guard for details", "Secure an exit route"];

type OnboardingBannerKey = "guided" | "consequencePrimer" | "failForward" | "difficultyIntro" | "capExplanation";

const ONBOARDING_BANNER_KEYS: readonly OnboardingBannerKey[] = [
  "guided",
  "consequencePrimer",
  "failForward",
  "difficultyIntro",
  "capExplanation",
];

const demoTurns: DemoTurn[] = [
  {
    id: "t1",
    playerText: "Inspect the dock lantern.",
    assistantText: "You find fresh oil and a hidden crest engraved in the base.",
    outcome: "success",
    stateDeltas: [{ op: "flag.set", key: "crestSeen", value: true }],
    ledgerAdds: [{ type: "clue", summary: "Hidden crest found in lantern base." }],
    suggestedOptions: [
      { id: "o1", label: "Ask the watch captain for patrol logs.", contextTag: "social" },
      { id: "o2", label: "Search crates by the pier.", contextTag: "resource" },
      { id: "o3", label: "Wait and observe quietly.", contextTag: "neutral" },
    ],
  },
  {
    id: "t2",
    playerText: "Ask the night guard who was here last.",
    assistantText: "He mentions a courier in a dark coat heading east just before midnight.",
    outcome: "mixed",
    stateDeltas: [
      { op: "relationship.shift", before: 2, after: 1 },
      { op: "time.inc", by: 1 },
    ],
    ledgerAdds: [
      { type: "witness", summary: "Courier seen heading east before midnight." },
      { type: "strain", summary: "Questioning the guard strained trust." },
    ],
    suggestedOptions: [
      { id: "o4", label: "Confront the courier route immediately.", contextTag: "hazard" },
      { id: "o5", label: "Send word to allies first.", contextTag: "social" },
      { id: "o6", label: "Gather supplies before moving.", contextTag: "resource" },
    ],
  },
  {
    id: "t3",
    playerText: "Intercept the courier at the east gate.",
    assistantText: "The courier bolts, alarms ring, and your crew is forced into a costly retreat.",
    outcome: "fail",
    reportedRiskLevel: "MODERATE",
    stateDeltas: [
      { op: "relationship.shift", before: 3, after: 2 },
      { op: "inv.remove", item: "field-supplies", qty: 1 },
      { op: "flag.set", key: "alarmRaised", value: true },
    ],
    ledgerAdds: [
      { type: "combat", summary: "Health cost from melee damage during retreat." },
      { type: "resource", summary: "Supplies lost while breaking contact." },
      { type: "social", summary: "Squad confidence dipped after the failed push." },
    ],
    capReason: "OPTIONS_TRUNCATED",
    suggestedOptions: [
      { id: "o7", label: "Regroup at a safe house.", contextTag: "resource" },
      { id: "o8", label: "Push deeper before they reset defenses.", contextTag: "hazard" },
    ],
  },
];

const demoTurnSignals = demoTurns.map((turn) => {
  const turnEventLike = {
    resolution: { tier: turn.outcome },
    deltas: turn.stateDeltas,
    ledgerAdds: turn.ledgerAdds,
  };
  const consequence = classifyConsequence(turnEventLike);
  const reasonLines = explainConsequence(turnEventLike);
  return {
    consequence,
    reasonLines,
  };
});

const demoCapSnapshots = demoTurns.map((turn) =>
  deriveCapSnapshot({
    resolution: { tier: turn.outcome },
    deltas: turn.stateDeltas,
    ledgerAdds: turn.ledgerAdds,
    options: turn.suggestedOptions,
    assistantText: turn.assistantText,
    capReason: turn.capReason,
  }),
);

const demoDifficultySignals = demoTurns.map((turn, index) => ({
  riskLevel: demoTurnSignals[index]?.consequence.riskLevel ?? "LOW",
  escalation: demoTurnSignals[index]?.consequence.escalation ?? "NONE",
  isFailure: turn.outcome === "fail",
  isSuccessBand: turn.outcome === "success",
}));

const demoDifficultyStates = demoDifficultySignals.map((_, index) =>
  deriveDifficultyStateFromTurnSignals(demoDifficultySignals.slice(0, index + 1)),
);

const firstResolvedTurnIndex = demoTurns.findIndex((turn) =>
  turn.outcome === "success" || turn.outcome === "mixed" || turn.outcome === "fail",
);
const firstFailureTurnIndex = demoTurns.findIndex((turn) => turn.outcome === "fail");
const firstCapTurnIndex = demoCapSnapshots.findIndex((snapshot) => snapshot.capReason !== "NONE");
const firstCalmToTenseTurnIndex = demoDifficultyStates.findIndex((state, index) => {
  if (index === 0) return false;
  const previous = demoDifficultyStates[index - 1];
  return previous?.tier === "CALM" && state.tier === "TENSE";
});

function derivePreActionRisk(
  option: DemoOption,
  previous: (typeof demoTurnSignals)[number] | undefined,
): OptionRisk {
  if (option.contextTag === "hazard") return "HIGH";
  if (!previous) return "UNKNOWN";
  if (previous.consequence.riskLevel === "HIGH") return "HIGH";
  if (previous.consequence.escalation !== "NONE") return "MODERATE";
  if (option.contextTag === "social") return "MODERATE";
  if (option.contextTag === "resource") return "LOW";
  return "UNKNOWN";
}

function toPlayerFriendlyStakesReasons(reasonLines: string[]): string[] {
  const mapped = reasonLines.map((line) => {
    const normalized = line.trim().toUpperCase();
    if (normalized.startsWith("HEALTH COST:")) return "Health cost: You took meaningful harm.";
    if (normalized.startsWith("RELATIONSHIP COST:")) return "Relationship cost: Trust was strained.";
    if (normalized.startsWith("REPUTATION COST:")) return "Reputation cost: Standing took a hit.";
    if (normalized.startsWith("FLAG COST:")) return "Pressure indicator: A key danger flag was triggered.";
    if (normalized.startsWith("ESCALATION MAJOR:")) return "Escalation: Multiple fronts shifted at once.";
    if (normalized.startsWith("ESCALATION MINOR:")) return "Escalation: Pressure increased in the scene.";
    if (normalized.startsWith("RISK OVERRIDE")) return "Scenario stakes marker raised danger for this turn.";
    return "Consequences escalated based on your latest move.";
  });
  const deduped: string[] = [];
  for (const line of mapped) {
    if (!deduped.includes(line)) {
      deduped.push(line);
    }
  }
  return deduped.length > 0 ? deduped : ["No major costs were detected."];
}

function resolveOptionRiskExplanation(optionRisk: OptionRisk): string {
  if (optionRisk === "UNKNOWN") {
    return "UNKNOWN = risk cannot be inferred yet";
  }
  return OPTION_RISK_EXPLANATION_MAP[optionRisk];
}

function orderedCostTypes(costTypes: ConsequenceCostType[]): ConsequenceCostType[] {
  return [...CONSEQUENCE_RULE_TABLE.costTypeOrder].filter((costType) => costTypes.includes(costType));
}

function formatCostTypeList(costTypes: ConsequenceCostType[]): string {
  const ordered = orderedCostTypes(costTypes);
  return ordered.length > 0 ? ordered.join(", ") : "NONE";
}

function formatCostTypeIcons(costTypes: ConsequenceCostType[]): string {
  const ordered = orderedCostTypes(costTypes);
  return ordered.length > 0 ? ordered.map((costType) => COST_TYPE_ICON_MAP[costType]).join(" ") : "∅";
}

export default function Home() {
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  const [dismissedBanners, setDismissedBanners] = useState<Record<OnboardingBannerKey, boolean>>({
    guided: false,
    consequencePrimer: false,
    failForward: false,
    difficultyIntro: false,
    capExplanation: false,
  });
  const isFirstSession = demoSaveSlots.length === 0;
  const showSessionComplete = demoTurns.length >= SESSION_ARC_TURN_THRESHOLD;

  function dismissBanner(key: OnboardingBannerKey): void {
    setDismissedBanners((prev) => ({ ...prev, [key]: true }));
  }

  function startDemoScenario(): void {
    setSelectedScenarioId("mystery-docks-demo");
  }

  function startNewSession(): void {
    setSelectedScenarioId(null);
    const next: Record<OnboardingBannerKey, boolean> = {
      guided: false,
      consequencePrimer: false,
      failForward: false,
      difficultyIntro: false,
      capExplanation: false,
    };
    for (const key of ONBOARDING_BANNER_KEYS) {
      next[key] = false;
    }
    setDismissedBanners(next);
  }

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <Image
          className={styles.logo}
          src="/next.svg"
          alt="Next.js logo"
          width={100}
          height={20}
          priority
        />
        <div className={styles.intro}>
          <h1>To get started, edit the page.tsx file.</h1>
          <p>
            Looking for a starting point or more instructions? Head over to{" "}
            <a
              href="https://vercel.com/templates?framework=next.js&utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
              target="_blank"
              rel="noopener noreferrer"
            >
              Templates
            </a>{" "}
            or the{" "}
            <a
              href="https://nextjs.org/learn?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
              target="_blank"
              rel="noopener noreferrer"
            >
              Learning
            </a>{" "}
            center.
          </p>
        </div>
        <div className={styles.ctas}>
          <a
            className={styles.primary}
            href="https://vercel.com/new?utm_source=create-next-app&utm_medium=appdir-template&utm_campaign=create-next-app"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Image
              className={styles.logo}
              src="/vercel.svg"
              alt="Vercel logomark"
              width={16}
              height={16}
            />
            Deploy Now
          </a>
          <a
            className={styles.secondary}
            href="https://nextjs.org/docs?utm_source=create-next-app&utm_medium=appdir-template&utm_campaign=create-next-app"
            target="_blank"
            rel="noopener noreferrer"
          >
            Documentation
          </a>
        </div>

        <section className={styles.playSurface}>
          <div className={styles.sessionControls}>
            <button type="button" onClick={startNewSession} className={styles.dismissButton}>
              New session
            </button>
            <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
              {selectedScenarioId ? `Scenario: ${selectedScenarioId}` : "No scenario selected"}
            </span>
          </div>

          {!selectedScenarioId ? (
            <div className={styles.onboardingCard} role="status" aria-live="polite">
              <div style={{ fontSize: "0.95rem", fontWeight: 700 }}>Choose a scenario to begin</div>
              <ul style={{ marginTop: 6, paddingLeft: "1rem", fontSize: "0.8rem", color: "#e2e8f0" }}>
                <li>Start with one clear objective.</li>
                <li>Set an opening risk level before acting.</li>
                <li>Use consequences to branch your next move.</li>
              </ul>
              <button type="button" onClick={startDemoScenario} className={styles.dismissButton} style={{ marginTop: 8 }}>
                Use demo scenario
              </button>
            </div>
          ) : null}

          {isFirstSession && !dismissedBanners.guided ? (
            <div className={styles.onboardingCard} role="status" aria-live="polite">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <div style={{ fontSize: "0.95rem", fontWeight: 700 }}>WELCOME TO YOUR FIRST SESSION</div>
                <button type="button" onClick={() => dismissBanner("guided")} className={styles.dismissButton}>
                  Dismiss
                </button>
              </div>
              <div style={{ marginTop: 8, fontSize: "0.8rem", color: "#cbd5e1" }}>GUIDED FIRST TURN</div>
              <ul style={{ marginTop: 6, paddingLeft: "1rem", fontSize: "0.8rem", color: "#e2e8f0" }}>
                <li>You choose actions.</li>
                <li>Risk is shown before you act.</li>
                <li>Failure creates new paths.</li>
              </ul>
              <details style={{ marginTop: 8 }}>
                <summary style={{ cursor: "pointer", fontSize: "0.8rem", color: "#cbd5e1" }}>
                  Risk badge guide
                </summary>
                <ul style={{ marginTop: 6, paddingLeft: "1rem", fontSize: "0.75rem", color: "#cbd5e1" }}>
                  <li>LOW = minor consequence</li>
                  <li>MODERATE = complication likely</li>
                  <li>HIGH = serious consequence possible</li>
                </ul>
              </details>
            </div>
          ) : null}

          <div className={styles.composerCard}>
            <label htmlFor="first-session-action" style={{ fontSize: "0.8rem", color: "#cbd5e1" }}>
              Your action
            </label>
            <input
              id="first-session-action"
              type="text"
              placeholder="Describe what you do next..."
              style={{
                marginTop: 6,
                width: "100%",
                borderRadius: 8,
                border: "1px solid #334155",
                background: "rgba(15,23,42,0.3)",
                color: "#e2e8f0",
                padding: "0.55rem 0.6rem",
                fontSize: "0.8rem",
              }}
            />
            {isFirstSession ? (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Example prompts</div>
                <ul style={{ marginTop: 4, paddingLeft: "1rem", fontSize: "0.75rem", color: "#cbd5e1" }}>
                  {EXAMPLE_PROMPTS.map((prompt) => (
                    <li key={prompt}>Try: {prompt}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </section>

        <section style={{ width: "100%", marginTop: "1rem" }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem" }}>Turn Transcript</h2>
          <div className={styles.transcriptScroller} style={{ display: "grid", gap: "0.75rem" }}>
            {demoTurns.map((t, index) => {
              const previousSignal = index > 0 ? demoTurnSignals[index - 1] : undefined;
              const turnSignal = demoTurnSignals[index];
              const stableTurnId = t.id;
              const isLatestTurn = index === demoTurns.length - 1;
              const reportedRisk = t.reportedRiskLevel ?? turnSignal.consequence.riskLevel;
              const hasStakeSyncError = reportedRisk !== turnSignal.consequence.riskLevel;
              const playerFriendlyReasons = toPlayerFriendlyStakesReasons(turnSignal.reasonLines);
              const capSnapshot = demoCapSnapshots[index];
              const difficultyTier = demoDifficultyStates[index]?.tier ?? "CALM";
              const showFirstResolvedTurnBanner =
                index === firstResolvedTurnIndex && !dismissedBanners.consequencePrimer;
              const showFirstFailureTurnBanner = index === firstFailureTurnIndex && !dismissedBanners.failForward;
              const showFirstCappedTurnBanner = index === firstCapTurnIndex && !dismissedBanners.capExplanation;
              const showFirstCalmToTenseBanner =
                index === firstCalmToTenseTurnIndex && !dismissedBanners.difficultyIntro;

              return (
                <article
                  key={t.id}
                  style={{
                    width: "100%",
                    border: "1px solid #2b2b2b",
                    borderRadius: 12,
                    padding: "0.75rem",
                    background: "rgba(10,10,10,0.25)",
                  }}
                >
                  <div style={{ fontSize: "0.875rem", color: "#94a3b8" }}>You</div>
                  <div style={{ marginTop: 4 }}>{t.playerText}</div>
                  {showFirstResolvedTurnBanner ? (
                    <details
                      open
                      role="status"
                      aria-live="polite"
                      style={{
                        marginTop: 10,
                        border: "1px solid #334155",
                        borderRadius: 10,
                        padding: "0.5rem",
                        fontSize: "0.75rem",
                        color: "#e2e8f0",
                        background: "rgba(30,41,59,0.2)",
                      }}
                    >
                      <summary style={{ cursor: "pointer", fontWeight: 600 }}>WHY DID THIS HAPPEN?</summary>
                      <div style={{ marginTop: 6 }}>
                        Every consequence is tied to explicit state changes.
                        <br />
                        You can inspect them anytime.
                      </div>
                      <button
                        type="button"
                        onClick={() => dismissBanner("consequencePrimer")}
                        className={styles.dismissButton}
                        style={{ marginTop: 6 }}
                      >
                        Dismiss
                      </button>
                    </details>
                  ) : null}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
                    <div style={{ fontSize: "0.875rem", color: "#94a3b8" }}>Narrator</div>
                    <ResolutionBadge outcome={t.outcome} />
                    <a
                      href={`#turn-${stableTurnId}-consequences`}
                      className="ml-2 text-xs text-neutral-400 underline hover:text-neutral-200"
                    >
                      See why
                    </a>
                    <a
                      href={`#turn-${stableTurnId}-why-peek`}
                      className="ml-2 text-xs text-neutral-400 underline hover:text-neutral-200"
                    >
                      Why? peek
                    </a>
                  </div>
                  <div style={{ marginTop: 4 }}>{t.assistantText}</div>
                  <div
                    role="status"
                    aria-live="polite"
                    style={{
                      marginTop: 8,
                      display: "flex",
                      gap: 6,
                      flexWrap: "wrap",
                      fontSize: "0.7rem",
                    }}
                  >
                    <span className={styles.recapChip}>Risk: {reportedRisk}</span>
                    <span className={styles.recapChip}>Escalation: {turnSignal.consequence.escalation}</span>
                    <span className={styles.recapChip}>Difficulty: {difficultyTier}</span>
                  </div>

                  {t.outcome === "fail" ? (
                    <div
                      role="status"
                      aria-live="polite"
                      style={{
                        marginTop: 10,
                        border: "1px solid #7f1d1d",
                        borderRadius: 10,
                        padding: "0.5rem",
                        fontSize: "0.75rem",
                        color: "#fecaca",
                        background: "rgba(127,29,29,0.2)",
                      }}
                    >
                      <div>COMPLICATION TRIGGERED</div>
                      {turnSignal.consequence.escalation === "MAJOR" ? <div>MAJOR CONSEQUENCE</div> : null}
                      {showFirstFailureTurnBanner ? (
                        <div style={{ marginTop: 4 }}>
                          FAILURE CHANGES THE STORY — IT DOES NOT END IT.
                          <button
                            type="button"
                            onClick={() => dismissBanner("failForward")}
                            className={styles.dismissButton}
                            style={{ marginLeft: 8 }}
                          >
                            Dismiss
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {isLatestTurn && capSnapshot?.capReason !== "NONE" ? (
                    <div style={{ marginTop: 8, fontSize: "0.75rem", color: "#fca5a5" }}>
                      LIMIT APPLIED: {capSnapshot?.capReason}
                    </div>
                  ) : null}
                  {showFirstCappedTurnBanner && capSnapshot?.capReason !== "NONE" ? (
                    <details
                      role="status"
                      aria-live="polite"
                      style={{
                        marginTop: 8,
                        border: "1px solid #7c2d12",
                        borderRadius: 10,
                        padding: "0.5rem",
                        fontSize: "0.75rem",
                        color: "#fdba74",
                        background: "rgba(124,45,18,0.2)",
                      }}
                    >
                      <summary style={{ cursor: "pointer", fontWeight: 600 }}>WHY IS THERE A LIMIT?</summary>
                      <div style={{ marginTop: 6 }}>Limits ensure consistent performance and pacing.</div>
                      <button
                        type="button"
                        onClick={() => dismissBanner("capExplanation")}
                        className={styles.dismissButton}
                        style={{ marginTop: 6 }}
                      >
                        Dismiss
                      </button>
                    </details>
                  ) : null}
                  {showFirstCalmToTenseBanner ? (
                    <div
                      role="status"
                      aria-live="polite"
                      style={{
                        marginTop: 8,
                        border: "1px solid #0e7490",
                        borderRadius: 10,
                        padding: "0.5rem",
                        fontSize: "0.75rem",
                        color: "#bae6fd",
                        background: "rgba(14,116,144,0.2)",
                      }}
                    >
                      <div>TENSION IS RISING.</div>
                      <div>Your choices are shaping the stakes.</div>
                      <button
                        type="button"
                        onClick={() => dismissBanner("difficultyIntro")}
                        className={styles.dismissButton}
                        style={{ marginTop: 6 }}
                      >
                        Dismiss
                      </button>
                    </div>
                  ) : null}

                  <div
                    style={{
                      marginTop: 10,
                      border: "1px solid #334155",
                      borderRadius: 10,
                      padding: "0.6rem",
                      fontSize: "0.75rem",
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>STAKES RESULT</div>
                    <div>Risk: {reportedRisk}</div>
                    <div>Cost Types: {formatCostTypeList(turnSignal.consequence.costTypes)}</div>
                    <div>Escalation: {turnSignal.consequence.escalation}</div>
                    <div>Cost Icons: {formatCostTypeIcons(turnSignal.consequence.costTypes)}</div>
                    <div style={{ marginTop: 6 }}>
                      Escalation Ladder:{" "}
                      {ESCALATION_LADDER.map((level) => (
                        <span
                          key={`${stableTurnId}-${level}`}
                          style={{
                            display: "inline-block",
                            marginRight: 6,
                            padding: "0 6px",
                            borderRadius: 999,
                            border: "1px solid #475569",
                            background:
                              turnSignal.consequence.escalation === level ? "rgba(56,189,248,0.2)" : "transparent",
                            color: turnSignal.consequence.escalation === level ? "#bae6fd" : "#cbd5e1",
                          }}
                        >
                          {level}
                        </span>
                      ))}
                    </div>
                    {hasStakeSyncError ? (
                      <div style={{ marginTop: 6, color: "#fca5a5" }}>STAKE_SYNC_ERROR</div>
                    ) : null}
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Suggested options (PRE-ACTION RISK)</div>
                    <ul style={{ marginTop: 6, paddingLeft: "1rem", display: "grid", gap: 6 }}>
                      {t.suggestedOptions.map((option) => {
                        const optionRisk = derivePreActionRisk(option, previousSignal);
                        const highRiskOption = optionRisk === "HIGH";
                        return (
                          <li
                            key={option.id}
                            className={highRiskOption ? "risk-high-option" : "risk-option"}
                            style={{
                              border: highRiskOption ? "1px solid #b91c1c" : "1px solid #334155",
                              borderRadius: 8,
                              padding: "0.45rem",
                              background: highRiskOption ? "rgba(185,28,28,0.15)" : "rgba(15,23,42,0.2)",
                            }}
                          >
                            <div>{option.label}</div>
                            <span
                              title={resolveOptionRiskExplanation(optionRisk)}
                              aria-label={resolveOptionRiskExplanation(optionRisk)}
                              style={{
                                marginTop: 4,
                                display: "inline-block",
                                border: "1px solid #475569",
                                borderRadius: 999,
                                padding: "0 8px",
                                fontSize: "0.7rem",
                                color: "#e2e8f0",
                              }}
                            >
                              {optionRisk === "UNKNOWN" ? "UNKNOWN RISK" : optionRisk}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>

                  <div id={`turn-${stableTurnId}-consequences`} style={{ marginTop: 10 }}>
                    <details id={`turn-${stableTurnId}-why-peek`}>
                      <summary style={{ cursor: "pointer", fontSize: "0.8rem", color: "#cbd5e1" }}>Why?</summary>
                      <ul style={{ marginTop: 8, paddingLeft: "1rem", fontSize: "0.75rem", color: "#cbd5e1" }}>
                        {playerFriendlyReasons.map((reason, reasonIndex) => (
                          <li key={`${stableTurnId}-reason-${reasonIndex}`}>{reason}</li>
                        ))}
                      </ul>
                    </details>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {showSessionComplete ? (
          <section
            style={{
              width: "100%",
              marginTop: "1rem",
              border: "1px solid #334155",
              borderRadius: 12,
              padding: "0.75rem",
              background: "rgba(15,23,42,0.25)",
              fontSize: "0.8rem",
            }}
          >
            <div style={{ fontWeight: 700 }}>SESSION ARC COMPLETE</div>
            <div>You can continue or start a new path.</div>
          </section>
        ) : null}

        <section
          role="status"
          aria-live="polite"
          style={{
            width: "100%",
            marginTop: "0.75rem",
            borderTop: "1px solid #334155",
            paddingTop: "0.75rem",
            fontSize: "0.8rem",
            color: "#cbd5e1",
          }}
        >
          <div>Type /state to inspect state</div>
          <div>Type /summary to recap</div>
          <div style={{ marginTop: 6, color: "#94a3b8" }}>Hint: use /rewind to revisit a prior turn.</div>
        </section>
      </main>
    </div>
  );
}
