import type { OutcomeTier, StateDelta, LedgerEntry } from "./resolveTurnContract";

export type ResolveActionEffectsInput = {
  mode: "DO" | "SAY" | "LOOK";
  playerText: string;
  state: Record<string, unknown> | null;
  outcomeTier: OutcomeTier;
};

export type ResolveActionEffectsResult = {
  stateDeltas: StateDelta[];
  ledgerAdds: LedgerEntry[];
  tags?: string[];
};

const LOOK_KEYWORDS = [
  "inspect",
  "search",
  "examine",
  "study",
  "scan",
  "check",
  "investigate",
  "look around",
];
const DO_KEYWORDS = [
  "sneak",
  "creep",
  "slink",
  "edge",
  "pry",
  "force",
  "break",
  "shove",
  "smash",
  "rip",
  "pick lock",
  "manipulate",
  "loosen",
  "unfasten",
  "disable",
  "adjust",
  "move silently",
  "move quietly",
];
const SAY_KEYWORDS = [
  "bluff",
  "lie",
  "pretend",
  "claim",
  "insist",
  "tell them",
  "ask",
  "question",
  "probe",
  "persuade",
  "convince",
  "press for details",
  "threaten",
  "demand",
  "accuse",
  "confront",
  "order",
  "intimidate",
];

const buildLedgerEntry = (delta: StateDelta, tier: OutcomeTier, detail: string): LedgerEntry => ({
  kind: "state_change",
  cause: "action",
  effect: `${detail} (${tier})`,
  deltaKind: delta.kind,
});

const buildLookEffects = (tier: OutcomeTier): ResolveActionEffectsResult => {
  const progressFlag: StateDelta = { kind: "flag.set", key: "observed.area", value: true };
  const clueProgress: StateDelta = { kind: "inventory.add", itemId: "ledger_fragment", quantity: 1 };
  const partialClue: StateDelta = { kind: "flag.set", key: "observed.partial", value: true };
  const timeCost: StateDelta = { kind: "pressure.add", domain: "time", amount: 1 };
  const suspicionCost: StateDelta = { kind: "pressure.add", domain: "suspicion", amount: 1 };
  const noiseCost: StateDelta = { kind: "pressure.add", domain: "noise", amount: 1 };
  switch (tier) {
    case "success":
      return {
        stateDeltas: [progressFlag, clueProgress],
        ledgerAdds: [buildLedgerEntry(progressFlag, tier, "Observation locked in")],
        tags: ["action:look"],
      };
    case "success_with_cost":
      return {
        stateDeltas: [progressFlag, clueProgress, timeCost, suspicionCost],
        ledgerAdds: [
          buildLedgerEntry(progressFlag, tier, "Observation plus cost"),
          buildLedgerEntry(timeCost, tier, "Time drags during inspection"),
        ],
        tags: ["action:look"],
      };
    case "mixed":
      return {
        stateDeltas: [partialClue, timeCost, noiseCost],
        ledgerAdds: [
          buildLedgerEntry(partialClue, tier, "Partial clue found"),
          buildLedgerEntry(noiseCost, tier, "Noise creeps up"),
        ],
        tags: ["action:look"],
      };
    case "failure_with_progress":
      return {
        stateDeltas: [partialClue, suspicionCost],
        ledgerAdds: [
          buildLedgerEntry(partialClue, tier, "Observation still exposes something"),
          buildLedgerEntry(suspicionCost, tier, "Suspicion climbs"),
        ],
        tags: ["action:look"],
      };
    case "failure":
    default:
      return {
        stateDeltas: [timeCost],
        ledgerAdds: [buildLedgerEntry(timeCost, tier, "Time wasted on nothing")],
        tags: ["action:look"],
      };
  }
};

const buildDoEffects = (tier: OutcomeTier): ResolveActionEffectsResult => {
  const stealthProgress: StateDelta = { kind: "flag.set", key: "position.advanced", value: true };
  const stealthNoise: StateDelta = { kind: "pressure.add", domain: "noise", amount: 1 };
  const stealthDanger: StateDelta = { kind: "pressure.add", domain: "danger", amount: 1 };
  const forceProgress: StateDelta = { kind: "flag.set", key: "obstacle.cleared", value: true };
  const forceNoise: StateDelta = { kind: "pressure.add", domain: "noise", amount: 2 };
  const forceDanger: StateDelta = { kind: "pressure.add", domain: "danger", amount: 1 };
  const toolProgress: StateDelta = { kind: "flag.set", key: "access.partial", value: true };
  const toolTime: StateDelta = { kind: "pressure.add", domain: "time", amount: 1 };
  const toolSuspicion: StateDelta = { kind: "pressure.add", domain: "suspicion", amount: 1 };
  switch (tier) {
    case "success":
      return {
        stateDeltas: [forceProgress, stealthProgress, stealthNoise],
        ledgerAdds: [
          buildLedgerEntry(forceProgress, tier, "Obstacle cleared"),
          buildLedgerEntry(stealthProgress, tier, "Position advanced"),
          buildLedgerEntry(stealthNoise, tier, "Noise tick"),
        ],
        tags: ["action:do"],
      };
    case "success_with_cost":
      return {
        stateDeltas: [forceProgress, forceNoise, toolTime],
        ledgerAdds: [
          buildLedgerEntry(forceProgress, tier, "Forceful breakthrough"),
          buildLedgerEntry(forceNoise, tier, "Noise spikes"),
        ],
        tags: ["action:do"],
      };
    case "mixed":
      return {
        stateDeltas: [toolProgress, toolTime, stealthNoise],
        ledgerAdds: [
          buildLedgerEntry(toolProgress, tier, "Partial access gained"),
          buildLedgerEntry(toolTime, tier, "Time ticks as you fiddle"),
        ],
        tags: ["action:do"],
      };
    case "failure_with_progress":
      return {
        stateDeltas: [toolProgress, toolSuspicion],
        ledgerAdds: [
          buildLedgerEntry(toolProgress, tier, "Lock partially loosened"),
          buildLedgerEntry(toolSuspicion, tier, "Suspicion rises"),
        ],
        tags: ["action:do"],
      };
    case "failure":
    default:
      return {
        stateDeltas: [stealthNoise, stealthDanger],
        ledgerAdds: [
          buildLedgerEntry(stealthNoise, tier, "Failed to move quietly"),
          buildLedgerEntry(stealthDanger, tier, "Danger alarms spike"),
        ],
        tags: ["action:do"],
      };
  }
};

const buildSayEffects = (tier: OutcomeTier, normalized: string): ResolveActionEffectsResult => {
  const bluffProgress: StateDelta = { kind: "flag.set", key: "relation.access", value: true };
  const clueFlag: StateDelta = { kind: "flag.set", key: "knowledge.gained", value: true };
  const suspicionCost: StateDelta = { kind: "pressure.add", domain: "suspicion", amount: 1 };
  const hostilityCost: StateDelta = { kind: "pressure.add", domain: "danger", amount: 1 };
  const timeCost: StateDelta = { kind: "pressure.add", domain: "time", amount: 1 };
  const relationGain: StateDelta = { kind: "relation.shift", actorId: "npc", metric: "favor", amount: 1 };
  const relationHit: StateDelta = { kind: "relation.shift", actorId: "npc", metric: "favor", amount: -1 };
  const escalationFlag: StateDelta = { kind: "flag.set", key: "status.escalated", value: true };
  const isThreat = normalized.includes("threaten") || normalized.includes("demand") || normalized.includes("accuse") || normalized.includes("confront") || normalized.includes("order") || normalized.includes("intimidate");
  const isAsk = normalized.includes("ask") || normalized.includes("question") || normalized.includes("probe") || normalized.includes("persuade") || normalized.includes("convince") || normalized.includes("press");
  switch (tier) {
    case "success":
      return {
        stateDeltas: [relationGain, bluffProgress],
        ledgerAdds: [buildLedgerEntry(relationGain, tier, "Social gain")],
        tags: ["action:say"],
      };
    case "success_with_cost":
      return {
        stateDeltas: [relationGain, suspicionCost, timeCost],
        ledgerAdds: [
          buildLedgerEntry(relationGain, tier, "Social leverage with cost"),
          buildLedgerEntry(suspicionCost, tier, "Suspicion rises"),
        ],
        tags: ["action:say"],
      };
    case "mixed":
      return {
        stateDeltas: [clueFlag, suspicionCost, hostilityCost],
        ledgerAdds: [
          buildLedgerEntry(clueFlag, tier, "Partial truth revealed"),
          buildLedgerEntry(hostilityCost, tier, "Hostility spikes"),
        ],
        tags: ["action:say"],
      };
    case "failure_with_progress":
      return {
        stateDeltas: [clueFlag, suspicionCost, escalationFlag],
        ledgerAdds: [
          buildLedgerEntry(clueFlag, tier, "Weak clue gleaned"),
          buildLedgerEntry(escalationFlag, tier, "Tension increases"),
        ],
        tags: ["action:say"],
      };
    case "failure":
    default:
      return {
        stateDeltas: isThreat ? [hostilityCost, relationHit, escalationFlag] : [suspicionCost, timeCost],
        ledgerAdds: [
          buildLedgerEntry(isThreat ? hostilityCost : suspicionCost, tier, "Social backlash"),
        ],
        tags: ["action:say"],
      };
  }
};

export function resolveActionEffects(input: ResolveActionEffectsInput): ResolveActionEffectsResult {
  const normalized = input.playerText.toLowerCase();
  const matchesLook = LOOK_KEYWORDS.some((keyword) => normalized.includes(keyword));
  const matchesDo = DO_KEYWORDS.some((keyword) => normalized.includes(keyword));
  const matchesSay = SAY_KEYWORDS.some((keyword) => normalized.includes(keyword));
  if (input.mode === "LOOK" && matchesLook) {
    return buildLookEffects(input.outcomeTier);
  }
  if (input.mode === "DO" && matchesDo) {
    return buildDoEffects(input.outcomeTier);
  }
  if (input.mode === "SAY") {
    return buildSayEffects(input.outcomeTier, normalized);
  }
  return { stateDeltas: [], ledgerAdds: [] };
}
