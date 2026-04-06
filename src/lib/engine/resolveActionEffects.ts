import type { OutcomeTier, StateDelta, LedgerEntry } from "./resolveTurnContract";
import type { InventoryContext } from "@/lib/engine/inventory/inventoryContext";
import { normalizeActionText } from "@/lib/engine/inventory/actionMatchers";
import { evaluateInventoryAffordanceRules } from "@/lib/engine/inventory/affordanceRegistry";

export type ResolveActionEffectsInput = {
  mode: "DO" | "SAY" | "LOOK";
  playerText: string;
  state: Record<string, unknown> | null;
  outcomeTier: OutcomeTier;
  inventoryContext?: InventoryContext | null;
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
  "look at",
  "peek",
  "survey",
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
  "open",
  "push",
  "pull",
  "drive",
  "pull",
  "push",
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
  "tell",
  "say",
  "speak",
  "answer",
  "request",
  "demand",
];

const FIRE_TARGET_PATTERN = /\b(tapestry|drapes?|curtain|cloth|banner)\b/;

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
  const heavyTime: StateDelta = { kind: "pressure.add", domain: "time", amount: 2 };
  const suspicionCost: StateDelta = { kind: "pressure.add", domain: "suspicion", amount: 1 };
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
        stateDeltas: [partialClue, heavyTime, suspicionCost],
        ledgerAdds: [
          buildLedgerEntry(partialClue, tier, "Partial clue found"),
          buildLedgerEntry(heavyTime, tier, "Time stretches as you probe"),
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
  const stealthNoise: StateDelta = { kind: "pressure.add", domain: "noise", amount: 2 };
  const stealthDanger: StateDelta = { kind: "pressure.add", domain: "danger", amount: 1 };
  const forceProgress: StateDelta = { kind: "flag.set", key: "obstacle.cleared", value: true };
  const forceNoise: StateDelta = { kind: "pressure.add", domain: "noise", amount: 3 };
  const forceDanger: StateDelta = { kind: "pressure.add", domain: "danger", amount: 2 };
  const toolProgress: StateDelta = { kind: "flag.set", key: "access.partial", value: true };
  const toolNoise: StateDelta = { kind: "pressure.add", domain: "noise", amount: 2 };
  const toolDanger: StateDelta = { kind: "pressure.add", domain: "danger", amount: 1 };
  switch (tier) {
    case "success":
      return {
        stateDeltas: [forceProgress, stealthProgress, stealthNoise, stealthDanger],
        ledgerAdds: [
          buildLedgerEntry(forceProgress, tier, "Obstacle cleared"),
          buildLedgerEntry(stealthProgress, tier, "Position advanced"),
          buildLedgerEntry(stealthNoise, tier, "Noise tick"),
        ],
        tags: ["action:do"],
      };
    case "success_with_cost":
      return {
        stateDeltas: [forceProgress, forceNoise, forceDanger],
        ledgerAdds: [
          buildLedgerEntry(forceProgress, tier, "Forceful breakthrough"),
          buildLedgerEntry(forceNoise, tier, "Noise spikes"),
        ],
        tags: ["action:do"],
      };
    case "mixed":
      return {
        stateDeltas: [toolProgress, toolNoise, toolDanger],
        ledgerAdds: [
          buildLedgerEntry(toolProgress, tier, "Partial access gained"),
          buildLedgerEntry(toolNoise, tier, "Noise climbs during the attempt"),
        ],
        tags: ["action:do"],
      };
    case "failure_with_progress":
      return {
        stateDeltas: [toolProgress, forceDanger],
        ledgerAdds: [
          buildLedgerEntry(toolProgress, tier, "Lock partially loosened"),
          buildLedgerEntry(forceDanger, tier, "Danger alarms react"),
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

const buildDoFallback = (tier: OutcomeTier): ResolveActionEffectsResult => {
  const disturbance: StateDelta = { kind: "flag.set", key: "obstacle.disturbed", value: true };
  const noise: StateDelta = { kind: "pressure.add", domain: "noise", amount: 1 };
  const danger: StateDelta = { kind: "pressure.add", domain: "danger", amount: 1 };
  return {
    stateDeltas: [disturbance, noise, danger],
    ledgerAdds: [
      {
        kind: "state_change",
        cause: "action",
        effect: "Kinetic attempt disturbs the scene",
        deltaKind: disturbance.kind,
      },
    ],
    tags: ["action:do"],
  };
};

const buildSayFallback = (tier: OutcomeTier): ResolveActionEffectsResult => {
  const socialPartial: StateDelta = { kind: "flag.set", key: "social.partial", value: true };
  const escalation: StateDelta = { kind: "flag.set", key: "status.escalated", value: true };
  const suspicion: StateDelta = { kind: "pressure.add", domain: "suspicion", amount: 1 };
  return {
    stateDeltas: [socialPartial, escalation, suspicion],
    ledgerAdds: [
      {
        kind: "state_change",
        cause: "action",
        effect: "Social pressure builds even without a clean win",
        deltaKind: socialPartial.kind,
      },
    ],
    tags: ["action:say"],
  };
};

const buildSayEffects = (tier: OutcomeTier, normalized: string): ResolveActionEffectsResult => {
  const bluffProgress: StateDelta = { kind: "flag.set", key: "relation.access", value: true };
  const complianceFlag: StateDelta = { kind: "flag.set", key: "status.compliant", value: true };
  const socialPartial: StateDelta = { kind: "flag.set", key: "social.partial", value: true };
  const suspicionCost: StateDelta = { kind: "pressure.add", domain: "suspicion", amount: 2 };
  const whisperCost: StateDelta = { kind: "pressure.add", domain: "suspicion", amount: 1 };
  const relationGain: StateDelta = { kind: "relation.shift", actorId: "npc", metric: "favor", amount: 2 };
  const relationHit: StateDelta = { kind: "relation.shift", actorId: "npc", metric: "favor", amount: -1 };
  const escalationFlag: StateDelta = { kind: "flag.set", key: "status.escalated", value: true };
  const threatFlag: StateDelta = { kind: "flag.set", key: "status.hostile", value: true };
  const isThreat =
    normalized.includes("threaten") ||
    normalized.includes("demand") ||
    normalized.includes("accuse") ||
    normalized.includes("confront") ||
    normalized.includes("order") ||
    normalized.includes("intimidate");
  const isAsk =
    normalized.includes("ask") ||
    normalized.includes("question") ||
    normalized.includes("probe") ||
    normalized.includes("persuade") ||
    normalized.includes("convince") ||
    normalized.includes("press");
  switch (tier) {
    case "success":
      return {
        stateDeltas: [relationGain, bluffProgress, complianceFlag],
        ledgerAdds: [buildLedgerEntry(relationGain, tier, "Social gain")],
        tags: ["action:say"],
      };
    case "success_with_cost":
      return {
        stateDeltas: [relationGain, bluffProgress, suspicionCost],
        ledgerAdds: [
          buildLedgerEntry(relationGain, tier, "Social leverage with cost"),
          buildLedgerEntry(suspicionCost, tier, "Suspicion rises"),
        ],
        tags: ["action:say"],
      };
    case "mixed":
      return {
        stateDeltas: [socialPartial, suspicionCost, escalationFlag],
        ledgerAdds: [
          buildLedgerEntry(socialPartial, tier, "Partial leverage secured"),
          buildLedgerEntry(escalationFlag, tier, "Tension spikes"),
        ],
        tags: ["action:say"],
      };
    case "failure_with_progress":
      return {
        stateDeltas: [complianceFlag, suspicionCost, escalationFlag],
        ledgerAdds: [
          buildLedgerEntry(complianceFlag, tier, "Partial compliance registered"),
          buildLedgerEntry(escalationFlag, tier, "Tension increases"),
        ],
        tags: ["action:say"],
      };
    case "failure":
    default:
      return {
        stateDeltas: isThreat ? [suspicionCost, relationHit, escalationFlag, threatFlag] : [whisperCost, relationHit],
        ledgerAdds: [
          buildLedgerEntry(isThreat ? suspicionCost : whisperCost, tier, "Social backlash"),
        ],
        tags: ["action:say"],
      };
  }
};

export function resolveActionEffects(input: ResolveActionEffectsInput): ResolveActionEffectsResult {
  const normalized = normalizeActionText(input.playerText);
  const matchesLook = LOOK_KEYWORDS.some((keyword) => normalized.includes(keyword));
  const matchesDo = DO_KEYWORDS.some((keyword) => normalized.includes(keyword));
  const matchesSay = SAY_KEYWORDS.some((keyword) => normalized.includes(keyword));
  let result: ResolveActionEffectsResult = { stateDeltas: [], ledgerAdds: [] };

  if (input.mode === "LOOK") {
    result = matchesLook ? buildLookEffects(input.outcomeTier) : { stateDeltas: [], ledgerAdds: [] };
  } else if (input.mode === "DO") {
    result = matchesDo ? buildDoEffects(input.outcomeTier) : buildDoFallback(input.outcomeTier);
  } else if (input.mode === "SAY") {
    result = matchesSay ? buildSayEffects(input.outcomeTier, normalized) : buildSayFallback(input.outcomeTier);
  }

  return augmentWithInventoryAffordances(result, normalized, input.playerText, input.inventoryContext, input);
}

const augmentWithInventoryAffordances = (
  result: ResolveActionEffectsResult,
  normalized: string,
  rawText: string,
  inventoryContext?: InventoryContext | null,
  input?: ResolveActionEffectsInput,
): ResolveActionEffectsResult => {
  if (!inventoryContext || !input) return result;
  const carriedItems = inventoryContext.carriedItems.map((item) => ({
    key: item.key,
    lit: item.state?.lit === true,
    capabilities: item.tags ?? [],
  }));
  const context = {
    mode: input.mode,
    input: rawText,
    inventoryContext: {
      carriedItems,
      referencedItems: inventoryContext.referencedItems,
      capabilities: inventoryContext.capabilities,
    },
    state: input.state ?? null,
  };
  const match = evaluateInventoryAffordanceRules(context);
  console.log("inventory.affordance.rule_match", {
    ruleId: match?.ruleId ?? null,
    priority: match?.priority ?? null,
    matched: Boolean(match),
    canonicalInput: normalized,
    referencedItems: inventoryContext.referencedItems,
  });
  if (!match) return result;
  return {
    ...result,
    stateDeltas: [...result.stateDeltas, ...match.result.stateDeltas],
    ledgerAdds: [...result.ledgerAdds, ...match.result.ledgerAdds],
  };
};
