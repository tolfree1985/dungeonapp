import { createInitialStateV1, DEFAULT_ALERT_CLOCK_ID, DEFAULT_NOISE_CLOCK_ID } from "@/lib/game/bootstrap";
import { applyDeltas } from "@/lib/game/state";

type SupportedAction = "OBSERVE" | "MOVE" | "TALK" | "STEALTH" | "WAIT";
type OutcomeBand = "SUCCESS" | "SUCCESS_WITH_COST" | "FAIL_FORWARD";

type DeterministicTurnArgs = {
  playerText: string;
  previousState: unknown;
  turnIndex: number;
};

type DeterministicTurnResult = {
  action: SupportedAction;
  outcome: OutcomeBand;
  scene: string;
  resolution: {
    outcome: string;
    notes: string;
    action: SupportedAction;
  };
  stateDeltas: Array<Record<string, unknown>>;
  ledgerAdds: Array<Record<string, unknown>>;
  nextState: Record<string, unknown>;
};

type ReadableStats = Record<string, unknown> & {
  time: number;
  location: string;
  noise: number;
  alert: number;
  heat: number;
  trust: number;
  turns: number;
  progress?: number;
};

export type PressureStage = "calm" | "tension" | "danger" | "crisis";

export interface PressureEffects {
  observeTimeInc: number;
  waitHeatInc: number;
  waitAlertInc: number;
  stealthExtraNoiseOnFail: number;
  stealthExtraAlertOnFail: number;
}

const OUTCOME_CYCLE: OutcomeBand[] = ["SUCCESS", "SUCCESS_WITH_COST", "FAIL_FORWARD"];

export const PRESSURE_EFFECTS: Record<PressureStage, PressureEffects> = {
  calm: {
    observeTimeInc: 1,
    waitHeatInc: 0,
    waitAlertInc: 0,
    stealthExtraNoiseOnFail: 0,
    stealthExtraAlertOnFail: 0,
  },
  tension: {
    observeTimeInc: 1,
    waitHeatInc: 0,
    waitAlertInc: 0,
    stealthExtraNoiseOnFail: 0,
    stealthExtraAlertOnFail: 0,
  },
  danger: {
    observeTimeInc: 2,
    waitHeatInc: 1,
    waitAlertInc: 1,
    stealthExtraNoiseOnFail: 1,
    stealthExtraAlertOnFail: 1,
  },
  crisis: {
    observeTimeInc: 2,
    waitHeatInc: 1,
    waitAlertInc: 2,
    stealthExtraNoiseOnFail: 1,
    stealthExtraAlertOnFail: 2,
  },
};

const OBSERVE_CLUES = [
  {
    id: "forced_frame",
    name: "Fresh scrape mark",
    detail: "A scrape in the wood suggests the frame was forced recently.",
  },
  {
    id: "loose_stone",
    name: "Loose floor stone",
    detail: "One stone shifts slightly under pressure.",
  },
  {
    id: "drag_mark",
    name: "Drag mark",
    detail: "Dust patterns show something heavy was moved.",
  },
] as const;

const ACTION_SCENE_VARIANTS: Record<SupportedAction, Record<OutcomeBand, string[]>> = {
  OBSERVE: {
    SUCCESS: [
      "You slow the moment down, tracing the scene until a loose stone reveals the clue hidden behind it.",
      "You take in the room piece by piece and notice the one detail everyone else missed: a seam where the wall should be solid.",
      "You work the scene carefully, and the pattern finally clicks into place before the danger can shift.",
    ],
    SUCCESS_WITH_COST: [
      "You study the room long enough to find the useful clue, but the extra attention gives the environment time to turn wary.",
      "Your careful read exposes the hidden advantage, though the silence around you grows tighter while you work it out.",
      "You find the loose edge that matters, but the delay leaves the situation a little less forgiving than before.",
    ],
    FAIL_FORWARD: [
      "You search without finding the clean answer you wanted, but the false start exposes where the pressure will come from next.",
      "The first look gives you more warning than certainty, yet that warning is enough to change your next move.",
      "You do not uncover the full truth, but your failed read still reveals which part of the room is ready to move against you.",
    ],
  },
  MOVE: {
    SUCCESS: [
      "You advance decisively, taking better ground before the space can close around you.",
      "You move deeper through the environment and come out with a stronger position than you had a moment ago.",
      "You commit to motion and the room yields just enough for you to take the initiative.",
    ],
    SUCCESS_WITH_COST: [
      "You move where you need to, but the shift costs time and leaves traces that the world can read.",
      "You make the reposition work, though the path there sharpens the pressure around you.",
      "You get into the new position, but not cleanly; the environment notices the change even as you do.",
    ],
    FAIL_FORWARD: [
      "You fail to take the clean route forward, but the attempt still changes the tactical picture and burns the moment onward.",
      "The reposition stutters, yet the failed push still forces the situation into a new phase.",
      "You do not fully gain the ground you wanted, but the scramble still opens a different angle to work from.",
    ],
  },
  TALK: {
    SUCCESS: [
      "You choose your words carefully and the response comes back softer than the tension in the room suggested.",
      "The conversation lands. Not perfectly, but enough to tilt the social balance toward you.",
      "You speak into the moment with control, and the other side gives you more ground than it intended to.",
    ],
    SUCCESS_WITH_COST: [
      "You get the reaction you wanted, but the exchange also reveals more of your position than you would like.",
      "The conversation moves the social balance, though the room is now watching you more closely.",
      "Your words connect, but the cost is visibility; everyone now knows where you stand.",
    ],
    FAIL_FORWARD: [
      "The conversation does not settle the tension, but it does surface the fault line that will matter next.",
      "You fail to win them over, yet the exchange still makes the hidden dynamic obvious.",
      "The talk goes rough, but it gives you one hard fact about where the resistance really lives.",
    ],
  },
  STEALTH: {
    SUCCESS: [
      "You move with careful control, slipping through the space without giving it a clean read on you.",
      "The stealthy approach holds; you stay ahead of the room’s attention and keep the initiative quiet.",
      "You stay low, disciplined, and nearly invisible, moving just inside the edge of notice.",
    ],
    SUCCESS_WITH_COST: [
      "You stay hidden, but not perfectly; the noise you leave behind starts a slow rise in tension.",
      "The stealth works, though the room registers enough disturbance to tighten around your route.",
      "You avoid direct exposure, but the care it takes raises pressure elsewhere in the scene.",
    ],
    FAIL_FORWARD: [
      "You fail to stay fully concealed, but the disruption still carries you into a new position before the alarm can lock in.",
      "The stealth breaks at the edges, yet the scramble still leaves you with one more move before the pressure closes.",
      "You make too much sound to stay cleanly hidden, but the slip still reveals where the threat will come from.",
    ],
  },
  WAIT: {
    SUCCESS: [
      "You hold position and let the moment unfold, gaining clarity without surrendering your footing.",
      "Waiting proves useful for a beat; the room shows you one more tell before anything breaks.",
      "You do not move, and that restraint buys a small but real read on the situation.",
    ],
    SUCCESS_WITH_COST: [
      "You hold position long enough to learn something, but the pause gives the world time to gather itself.",
      "Waiting steadies you, though the pressure outside your control continues to build while you watch.",
      "You gain a cleaner sense of the moment, but the cost is time, and time is now moving against you.",
    ],
    FAIL_FORWARD: [
      "Holding still does not calm the situation, but it does make the next threat arrive where you can finally see it.",
      "Waiting fails to keep the pressure down, yet it reveals exactly how the world intends to tighten next.",
      "The pause costs you ground, but it also makes the danger legible enough to plan against.",
    ],
  },
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function cloneRecord<T>(value: T): T {
  return structuredClone(value);
}

function normalizeAdventureState(previousState: unknown): Record<string, unknown> {
  const base = cloneRecord(createInitialStateV1()) as Record<string, unknown>;
  const existing = asRecord(previousState);
  if (!existing) {
    return base;
  }

  const worldBase = asRecord(base.world) ?? {};
  const worldExisting = asRecord(existing.world);

  return {
    ...base,
    ...existing,
    world: {
      ...worldBase,
      ...(worldExisting ?? {}),
      clocks: {
        ...(asRecord(worldBase.clocks) ?? {}),
        ...(asRecord(worldExisting?.clocks) ?? {}),
      },
      flags: {
        ...(asRecord(worldBase.flags) ?? {}),
        ...(asRecord(worldExisting?.flags) ?? {}),
      },
    },
    inventory: {
      ...(asRecord(base.inventory) ?? {}),
      ...(asRecord(existing.inventory) ?? {}),
    },
    map: {
      ...(asRecord(base.map) ?? {}),
      ...(asRecord(existing.map) ?? {}),
      nodes: {
        ...(asRecord(asRecord(base.map)?.nodes) ?? {}),
        ...(asRecord(asRecord(existing.map)?.nodes) ?? {}),
      },
    },
    npcs: {
      ...(asRecord(base.npcs) ?? {}),
      ...(asRecord(existing.npcs) ?? {}),
    },
  };
}

function classifyAction(playerText: string): SupportedAction {
  const text = playerText.trim().toUpperCase();
  if (/\b(STEALTH|SNEAK|HIDE|CREEP)\b/.test(text)) return "STEALTH";
  if (/\b(TALK|SAY|ASK|SPEAK|PERSUADE)\b/.test(text)) return "TALK";
  if (/\b(MOVE|GO|WALK|RUN|ENTER|ADVANCE)\b/.test(text)) return "MOVE";
  if (/\b(WAIT|PAUSE|HOLD)\b/.test(text)) return "WAIT";
  return "OBSERVE";
}

function summarizeAction(text: string, fallback: string): string {
  const trimmed = text.trim();
  if (!trimmed) return fallback;
  return trimmed.length > 80 ? `${trimmed.slice(0, 77)}...` : trimmed;
}

function hashText(input: string): number {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function nextMoveDestination(state: Record<string, unknown>): string | null {
  const world = asRecord(state.world);
  const map = asRecord(state.map);
  const nodes = asRecord(map?.nodes);
  const currentId = typeof world?.locationId === "string" ? world.locationId : null;
  const currentNode = currentId ? asRecord(nodes?.[currentId]) : null;
  const exits = Array.isArray(currentNode?.exits) ? currentNode.exits.filter((exit) => typeof exit === "string") : [];
  return exits[0] ?? null;
}

function selectOutcome(turnIndex: number): OutcomeBand {
  return OUTCOME_CYCLE[turnIndex % OUTCOME_CYCLE.length] ?? "SUCCESS";
}

function selectScene(action: SupportedAction, outcome: OutcomeBand, turnIndex: number, playerText: string): string {
  const variants = ACTION_SCENE_VARIANTS[action][outcome];
  return variants[(hashText(playerText) + turnIndex) % variants.length] ?? variants[0];
}

function selectObserveClue(turnIndex: number, playerText: string) {
  return OBSERVE_CLUES[(hashText(playerText) + turnIndex) % OBSERVE_CLUES.length] ?? OBSERVE_CLUES[0];
}

function outcomeLabel(outcome: OutcomeBand): string {
  switch (outcome) {
    case "SUCCESS":
      return "Success";
    case "SUCCESS_WITH_COST":
      return "Success with Cost";
    case "FAIL_FORWARD":
      return "Fail Forward";
  }
}

function pressureStage(state: Record<string, unknown>): PressureStage {
  const stats = asRecord(state.stats) ?? {};
  const alert = Number(stats.alert ?? 0);
  const noise = Number(stats.noise ?? 0);
  const heat = Number(stats.heat ?? 0);
  const pressure = Math.max(alert, noise, heat);

  if (pressure >= 7) return "crisis";
  if (pressure >= 5) return "danger";
  if (pressure >= 3) return "tension";
  return "calm";
}

function pressureEffectsForState(state: Record<string, unknown>): PressureEffects {
  return PRESSURE_EFFECTS[pressureStage(state)];
}

function pressureRank(stage: PressureStage): number {
  switch (stage) {
    case "calm":
      return 0;
    case "tension":
      return 1;
    case "danger":
      return 2;
    case "crisis":
      return 3;
  }
}

function applyPressureToScene(scene: string, stage: PressureStage): string {
  switch (stage) {
    case "tension":
      return `${scene} The atmosphere tightens as attention begins to focus.`;
    case "danger":
      return `${scene} Movement in the shadows suggests the situation is escalating.`;
    case "crisis":
      return `${scene} The situation is now openly unstable and close to breaking.`;
    case "calm":
    default:
      return scene;
  }
}

function pressureFlagKey(stage: Exclude<PressureStage, "calm">): string {
  return `pressure.${stage}`;
}

function hasWorldFlag(state: Record<string, unknown>, key: string): boolean {
  const world = asRecord(state.world);
  const flags = asRecord(world?.flags);
  return flags?.[key] === true;
}

function readClockValue(state: Record<string, unknown>, clockId: string): number {
  const world = asRecord(state.world);
  const clocks = asRecord(world?.clocks);
  return Number(asRecord(clocks?.[clockId])?.value ?? 0);
}

function makeFlagDelta(key: string, value: boolean, detail: string, label = "Flag"): Record<string, unknown> {
  return {
    op: "flag.set",
    key,
    value,
    label,
    after: value,
    detail,
  };
}

function makeDerivedStatDelta(
  key: string,
  label: string,
  before: number,
  after: number,
  detail: string,
): Record<string, unknown> {
  return {
    op: "flag.set",
    key,
    value: true,
    label,
    before,
    after,
    detail,
  };
}

function setWorldFlag(state: Record<string, unknown>, key: string, value: boolean) {
  const world = asRecord(state.world);
  if (!world) return;
  if (!world.flags) world.flags = {};
  (world.flags as Record<string, boolean>)[key] = value;
}

function getWorldFlag(state: Record<string, unknown>, key: string): boolean {
  const world = asRecord(state.world);
  if (!world) return false;
  const flags = asRecord(world.flags);
  if (!flags) return false;
  const typedFlags = flags as Record<string, unknown>;
  const value = (typedFlags as any)[key];
  return Boolean(value);
}

function makeClockDelta(
  state: Record<string, unknown>,
  clockId: string,
  by: number,
  label: string,
  detail: string,
): Record<string, unknown> {
  const before = readClockValue(state, clockId);
  return {
    op: "clock.inc",
    id: clockId,
    by,
    label,
    before,
    after: before + by,
    detail,
  };
}

function makeTimeDelta(state: Record<string, unknown>, by: number, detail: string): Record<string, unknown> {
  const world = asRecord(state.world);
  const before = typeof world?.time === "number" ? world.time : 0;
  return {
    op: "time.inc",
    by,
    label: "Time",
    before,
    after: before + by,
    detail,
  };
}

function makeInventoryAddDelta(item: Record<string, unknown>, detail: string): Record<string, unknown> {
  return {
    op: "inv.add",
    item,
    label: typeof item.name === "string" ? item.name : "Inventory",
    after: `+${String(item.qty ?? 1)}`,
    detail,
  };
}

function makeMoveDelta(
  from: string | null,
  to: string,
  detail: string,
): Record<string, unknown> {
  return {
    op: "move",
    to,
    label: "Position",
    before: from ?? "unknown",
    after: to,
    detail,
  };
}

export function applyPostTurnReactions(params: {
  nextState: Record<string, unknown>;
  stateDeltas: Array<Record<string, unknown>>;
  ledgerAdds: Array<Record<string, unknown>>;
  action: SupportedAction;
  outcome: OutcomeBand;
  summary: string;
  turnIndex: number;
}): void {
  const { nextState, stateDeltas, ledgerAdds, action, outcome, summary, turnIndex } = params;
  const stats = asRecord(nextState.stats) ?? {};
  const noise = Number(stats.noise ?? 0);
  const stage = pressureStage(nextState);

  if (noise >= 3 && !hasWorldFlag(nextState, "threat.noise_peak")) {
    stateDeltas.push(
      makeFlagDelta(
        "threat.noise_peak",
        true,
        "Accumulated noise has crossed the point where attention becomes sustained.",
        "Threat flag",
      ),
    );
    ledgerAdds.push({
      cause: "threat",
      effect: "Accumulated noise has drawn sustained hostile attention.",
      detail: "The scene is now noisy enough that background suspicion hardens into an active search pattern.",
      action,
      outcome,
      summary,
      refTurnIndex: turnIndex,
    });
  }

  if (stage === "crisis" && !hasWorldFlag(nextState, "threat.lockdown")) {
    stateDeltas.push(
      makeFlagDelta(
        "threat.lockdown",
        true,
        "Crisis pressure has triggered an active hostile response.",
        "Threat flag",
      ),
    );
    ledgerAdds.push({
      cause: "threat",
      effect: "Pressure has reached crisis, triggering an active hostile response.",
      detail: "The pressure threshold is high enough that the world stops merely tracking you and starts locking down around you.",
      action,
      outcome,
      summary,
      refTurnIndex: turnIndex,
    });
  }
}

function hasInventoryItem(state: Record<string, unknown>, itemId: string): boolean {
  const inventory = asRecord(state.inventory);
  if (!inventory) return false;
  return Object.keys(inventory).includes(itemId);
}

export function evaluateQuestTriggers(params: {
  nextState: Record<string, unknown>;
  stateDeltas: Array<Record<string, unknown>>;
  ledgerAdds: Array<Record<string, unknown>>;
}): void {
  const { nextState, stateDeltas, ledgerAdds } = params;
  const stats = asRecord(nextState.stats) ?? {};
  const stage = String(stats.pressureStage ?? "calm") as PressureStage;
  const inventory = asRecord(nextState.inventory) ?? {};
  const hasClue = Object.keys(inventory).some((id) => id.startsWith("clue"));

  if (hasClue && !getWorldFlag(nextState, "quest.signal_source.clue_found")) {
    stateDeltas.push({
      op: "flag.set",
      key: "quest.signal_source.clue_found",
      value: true,
    });
    ledgerAdds.push({
      type: "quest",
      text: "The recovered clue reveals the next step in the investigation.",
    });
    setWorldFlag(nextState, "quest.signal_source.clue_found", true);
  }

  if (stage === "crisis" && !getWorldFlag(nextState, "quest.escape.alt_route_open")) {
    stateDeltas.push({
      op: "flag.set",
      key: "quest.escape.alt_route_open",
      value: true,
    });
    ledgerAdds.push({
      type: "quest",
      text: "Escalating danger has closed the obvious path and forced a new route.",
    });
    setWorldFlag(nextState, "quest.escape.alt_route_open", true);
  }

  if (getWorldFlag(nextState, "threat.lockdown") && !getWorldFlag(nextState, "quest.infiltration.lockdown_seen")) {
    stateDeltas.push({
      op: "flag.set",
      key: "quest.infiltration.lockdown_seen",
      value: true,
    });
    ledgerAdds.push({
      type: "quest",
      text: "The lockdown has changed the operation. You now need a way around security.",
    });
    setWorldFlag(nextState, "quest.infiltration.lockdown_seen", true);
  }
}

function projectReadableState(
  previousState: Record<string, unknown>,
  appliedState: Record<string, unknown>,
  action: SupportedAction,
  outcome: OutcomeBand,
  turnIndex: number,
  pressureEffects: PressureEffects,
): Record<string, unknown> {
  const world = asRecord(appliedState.world);
  const clocks = asRecord(world?.clocks);
  const existingStats = asRecord(previousState.stats) ?? {};
  const existingRelationships = asRecord(previousState.relationships) ?? {};
  const existingQuests = asRecord(previousState.quests) ?? {};

  const nextStats: ReadableStats = {
    ...existingStats,
    time: typeof world?.time === "number" ? world.time : Number(existingStats.time ?? 0),
    location:
      typeof world?.locationId === "string"
        ? world.locationId
        : typeof existingStats.location === "string"
          ? existingStats.location
          : "unknown",
    noise: Number(asRecord(clocks?.[DEFAULT_NOISE_CLOCK_ID])?.value ?? existingStats.noise ?? 0),
    alert: Number(asRecord(clocks?.[DEFAULT_ALERT_CLOCK_ID])?.value ?? existingStats.alert ?? 0),
    heat: Number(existingStats.heat ?? 0),
    trust: Number(existingStats.trust ?? 0),
    turns: turnIndex,
  };

  const nextRelationships = { ...existingRelationships };
  const nextQuests = { ...existingQuests };

  switch (action) {
    case "OBSERVE":
      nextQuests.survey = {
        status: outcome === "FAIL_FORWARD" ? "pressure" : "progress",
        detail:
          outcome === "SUCCESS"
            ? "You found a concrete clue to act on immediately."
            : outcome === "SUCCESS_WITH_COST"
              ? "You found a clue, but the search gave the room time to tighten."
              : "The clue is incomplete, but the danger it points to is now visible.",
      };
      nextStats.heat += outcome === "SUCCESS" ? 0 : 1;
      break;
    case "MOVE":
      nextQuests.advance = {
        status: outcome === "FAIL_FORWARD" ? "unstable" : "progress",
        detail:
          outcome === "FAIL_FORWARD"
            ? "The reposition was messy, but it still changed the tactical picture."
            : `You pushed forward to ${String(nextStats.location)}.`,
      };
      nextStats.progress = Number(existingStats.progress ?? 0) + 1;
      nextStats.heat += outcome === "SUCCESS" ? 0 : 1;
      break;
    case "TALK":
      nextRelationships.contact = {
        status: outcome === "SUCCESS" ? "open" : outcome === "SUCCESS_WITH_COST" ? "wary" : "guarded",
        detail:
          outcome === "SUCCESS"
            ? "The exchange shifted the social balance in your favor."
            : outcome === "SUCCESS_WITH_COST"
              ? "You moved the conversation, but the room is watching you harder now."
              : "The talk did not win them over, but it exposed the real resistance.",
      };
      nextStats.trust += outcome === "FAIL_FORWARD" ? 0 : 1;
      nextStats.heat += outcome === "SUCCESS" ? 0 : 1;
      break;
    case "STEALTH":
      nextRelationships.watchers = {
        status: outcome === "SUCCESS" ? "unsure" : "suspicious",
        detail:
          outcome === "SUCCESS"
            ? "You stayed ahead of notice, but the watchers remain tense."
            : outcome === "SUCCESS_WITH_COST"
              ? "Someone senses motion, but cannot place it yet."
              : "The stealth broke at the edges and the watchers are now sharpening focus.",
      };
      nextStats.heat += outcome === "SUCCESS" ? 0 : 2;
      break;
    case "WAIT":
      nextQuests.pressure = {
        status: outcome === "SUCCESS" ? "watchful" : "rising",
        detail:
          outcome === "SUCCESS"
            ? "The pause bought clarity without breaking your footing."
            : outcome === "SUCCESS_WITH_COST"
              ? "Holding position gave the situation more time to evolve."
              : "The pause cost you ground, but made the incoming pressure legible.",
      };
      nextStats.heat += 1 + pressureEffects.waitHeatInc;
      break;
  }

  return {
    ...appliedState,
    stats: {
      ...nextStats,
      pressureStage: pressureStage({ stats: nextStats }),
    },
    relationships: nextRelationships,
    quests: buildQuestView(appliedState),
  };
}

function buildQuestView(state: Record<string, unknown>) {
  const flags = asRecord(state.world)?.flags ?? {};
  const inventory = asRecord(state.inventory) ?? {};
  const hasClue = Object.keys(inventory).some((id) => id.startsWith("clue"));
  return [
    flags["quest.signal_source.clue_found"] || hasClue
      ? { id: "signal_source", label: "Signal Source", stage: "Trace the origin", status: "active" }
      : { id: "signal_source", label: "Signal Source", stage: "Find evidence", status: "active" },
    flags["quest.escape.alt_route_open"]
      ? { id: "escape", label: "Escape", stage: "Find an alternate route", status: "active" }
      : { id: "escape", label: "Escape", stage: "Reach the main exit", status: "active" },
    flags["quest.infiltration.lockdown_seen"]
      ? { id: "infiltration", label: "Infiltration", stage: "Bypass security", status: "active" }
      : { id: "infiltration", label: "Infiltration", stage: "Stay undetected", status: "active" },
  ];
}

export function resolveDeterministicTurn(args: DeterministicTurnArgs): DeterministicTurnResult {
  const normalizedState = normalizeAdventureState(args.previousState);
  const normalizedStats = asRecord(normalizedState.stats) ?? {};
  normalizedState.pressure = {
    noise: Number(normalizedState.pressure?.noise ?? normalizedStats.noise ?? 0),
    suspicion: Number(normalizedState.pressure?.suspicion ?? normalizedStats.suspicion ?? normalizedStats.npcSuspicion ?? 0),
    time: Number(normalizedState.pressure?.time ?? normalizedStats.time ?? normalizedStats.timeAdvance ?? 0),
    danger: Number(normalizedState.pressure?.danger ?? normalizedStats.danger ?? normalizedStats.positionPenalty ?? 0),
  };
  const playerIntentMode = args.mode ?? "LOOK";
  const action = classifyAction(args.playerText);
  const outcome = selectOutcome(args.turnIndex);
  const summary = summarizeAction(args.playerText, action);
  const destination = nextMoveDestination(normalizedState);
  const world = asRecord(normalizedState.world);
  const currentLocation = typeof world?.locationId === "string" ? world.locationId : null;
  const observeClue = selectObserveClue(args.turnIndex, args.playerText);
  const stage = pressureStage(normalizedState);
  const pressureEffects = pressureEffectsForState(normalizedState);
  const existingStats = asRecord(normalizedState.stats) ?? {};

  let stateDeltas: Array<Record<string, unknown>>;
  let ledgerAdds: Array<Record<string, unknown>>;
  let scene: string;
  let resolution: { outcome: string; notes: string; action: SupportedAction };

  scene = selectScene(action, outcome, args.turnIndex, args.playerText);

  switch (action) {
    case "MOVE":
      stateDeltas =
        outcome === "SUCCESS"
          ? destination
            ? [
                makeMoveDelta(currentLocation, destination, "You change position before the scene can settle against you."),
                makeTimeDelta(normalizedState, 1, "Movement costs a beat of time, even when it works cleanly."),
              ]
            : [
                makeTimeDelta(normalizedState, 1, "The attempted reposition still burns time."),
                makeFlagDelta(`move.turn_${args.turnIndex}`, true, "Your push changes the tactical picture even without a clean relocation.", "Momentum"),
              ]
          : outcome === "SUCCESS_WITH_COST"
            ? destination
            ? [
                makeMoveDelta(currentLocation, destination, "You reach the new position, but not without being noticed."),
                makeClockDelta(normalizedState, DEFAULT_ALERT_CLOCK_ID, 1, "Alert", "The movement leaves traces the world can read."),
                makeFlagDelta(`move.turn_${args.turnIndex}`, true, "The push still leaves you with a clearer line through the scene.", "Momentum"),
              ]
              : [
                  makeTimeDelta(normalizedState, 1, "The rough reposition consumes time."),
                  makeClockDelta(normalizedState, DEFAULT_ALERT_CLOCK_ID, 1, "Alert", "The failed line of advance still sharpens attention."),
                  makeFlagDelta(`move.turn_${args.turnIndex}`, true, "Even the rough advance creates a usable opening.", "Momentum"),
                ]
            : [
                makeTimeDelta(normalizedState, 1, "The scramble costs time immediately."),
                makeClockDelta(normalizedState, DEFAULT_ALERT_CLOCK_ID, 1, "Alert", "Your movement fails cleanly, but the pressure now knows where to focus."),
                makeFlagDelta(`move.turn_${args.turnIndex}`, true, "The failed route still exposes a new angle to work from next.", "Opening"),
              ];
      ledgerAdds = [
        {
          cause: "movement",
          effect:
            outcome === "SUCCESS"
              ? "Your position changes before the room can close around you."
              : outcome === "SUCCESS_WITH_COST"
                ? "You gain the new position, but the shift raises the room's alertness."
                : "The reposition burns time and raises pressure even though it is not fully clean.",
          detail:
            destination && outcome !== "FAIL_FORWARD"
              ? `By committing to the move, you reach ${destination} and force the situation to react.`
              : "By pushing for position under pressure, you alter the scene even without a perfectly clean advance.",
          action,
          outcome,
          summary,
        },
      ];
      break;
    case "TALK":
      stateDeltas =
        outcome === "SUCCESS"
          ? [
              makeFlagDelta(`talk.turn_${args.turnIndex}`, true, "The exchange lands and leaves a social opening behind.", "Social shift"),
              makeTimeDelta(normalizedState, 1, "Conversation still spends a beat of time."),
            ]
          : outcome === "SUCCESS_WITH_COST"
            ? [
                makeFlagDelta(`talk.turn_${args.turnIndex}`, true, "You move the social balance, but you also reveal your position.", "Social shift"),
                makeClockDelta(normalizedState, DEFAULT_ALERT_CLOCK_ID, 1, "Alert", "Everyone listening now has a clearer read on you."),
              ]
            : [
                makeFlagDelta(`talk.turn_${args.turnIndex}`, true, "The exchange does not win them over, but it exposes where resistance lives.", "Fault line"),
                makeClockDelta(normalizedState, DEFAULT_NOISE_CLOCK_ID, 1, "Noise", "Raised voices and sharper attention spread through the scene."),
              ];
      ledgerAdds = [
        {
          cause: "conversation",
          effect:
            outcome === "SUCCESS"
              ? "The social balance shifts toward you."
              : outcome === "SUCCESS_WITH_COST"
                ? "You win a little ground, but everyone is watching harder now."
                : "The conversation fails to settle things, but it exposes the true resistance.",
          detail:
            outcome === "SUCCESS"
              ? "By speaking with precision, you make the other side respond on your terms."
              : outcome === "SUCCESS_WITH_COST"
                ? "By pressing the exchange, you move the room socially while increasing tension."
                : "By forcing the conversation, you reveal the fault line even though rapport does not improve.",
          action,
          outcome,
          summary,
        },
      ];
      break;
    case "STEALTH":
      stateDeltas =
        outcome === "SUCCESS"
          ? [
              makeFlagDelta(`stealth.turn_${args.turnIndex}`, true, "You stay ahead of notice long enough to keep control of the route.", "Concealment"),
              makeTimeDelta(normalizedState, 1, "Even a clean stealth move consumes a careful beat."),
            ]
          : outcome === "SUCCESS_WITH_COST"
            ? [
                makeClockDelta(normalizedState, DEFAULT_NOISE_CLOCK_ID, 1, "Noise", "A small scrape or breath gives the room something to react to."),
                makeFlagDelta(`stealth.turn_${args.turnIndex}`, true, "You still keep enough concealment to continue the approach.", "Concealment"),
              ]
            : (() => {
                const deltas: Array<Record<string, unknown>> = [
                  makeClockDelta(normalizedState, DEFAULT_NOISE_CLOCK_ID, 1, "Noise", "The stealth breaks loudly enough to change the room."),
                  makeClockDelta(normalizedState, DEFAULT_ALERT_CLOCK_ID, 1, "Alert", "The failed concealment focuses attention on your route."),
                ];
                let replayBase = applyDeltas(normalizedState as any, deltas as any) as Record<string, unknown>;
                if (pressureEffects.stealthExtraNoiseOnFail > 0) {
                  deltas.push(
                    makeClockDelta(
                      replayBase,
                      DEFAULT_NOISE_CLOCK_ID,
                      pressureEffects.stealthExtraNoiseOnFail,
                      "Noise",
                      `With pressure already at ${stage}, the mistake lands harder and raises extra noise.`,
                    ),
                  );
                  replayBase = applyDeltas(normalizedState as any, deltas as any) as Record<string, unknown>;
                }
                if (pressureEffects.stealthExtraAlertOnFail > 0) {
                  deltas.push(
                    makeClockDelta(
                      replayBase,
                      DEFAULT_ALERT_CLOCK_ID,
                      pressureEffects.stealthExtraAlertOnFail,
                      "Alert",
                      `With pressure already at ${stage}, hostile attention escalates harder after the slip.`,
                    ),
                  );
                }
                return deltas;
              })();
      ledgerAdds = [
        {
          cause: "stealth",
          effect:
            outcome === "SUCCESS"
              ? "You keep the initiative without giving the room a clean read on you."
              : outcome === "SUCCESS_WITH_COST"
                ? "You stay hidden, but the environment picks up enough disturbance to grow tense."
                : "You lose the clean concealment, but the slip still reveals where the pressure now lives.",
          detail:
            outcome === "SUCCESS"
              ? "By moving with control, you stay ahead of notice and keep the route usable."
              : outcome === "SUCCESS_WITH_COST"
                ? "By slipping through carefully, you preserve stealth at the cost of rising noise."
                : "By overextending the stealthy move, you raise both noise and alert while still forcing the scene forward.",
          action,
          outcome,
          summary,
        },
      ];
      if (
        outcome === "FAIL_FORWARD" &&
        (pressureEffects.stealthExtraNoiseOnFail > 0 || pressureEffects.stealthExtraAlertOnFail > 0)
      ) {
        ledgerAdds.push({
          cause: "pressure",
          effect: `Stealth failure was amplified because pressure had already escalated to ${stage}.`,
          detail: "Once the situation is already hot, even a small concealment error compounds into louder noise and sharper alert.",
          action,
          outcome,
          summary,
          stage,
        });
      }
      break;
    case "WAIT":
      stateDeltas =
        outcome === "SUCCESS"
          ? [
              makeTimeDelta(normalizedState, 1, "Patience still lets the clock move forward."),
              makeFlagDelta(`wait.turn_${args.turnIndex}`, true, "The pause reveals a stable read on the situation.", "Read"),
            ]
          : outcome === "SUCCESS_WITH_COST"
            ? [
                makeTimeDelta(normalizedState, 1, "The pause costs time while you watch."),
                makeClockDelta(normalizedState, DEFAULT_ALERT_CLOCK_ID, 1, "Alert", "The world uses the same pause to tighten around you."),
              ]
            : [
                makeClockDelta(normalizedState, DEFAULT_ALERT_CLOCK_ID, 1, "Alert", "Waiting too long lets the threat organize itself."),
                makeClockDelta(normalizedState, DEFAULT_NOISE_CLOCK_ID, 1, "Noise", "Pressure builds audibly while nothing interrupts it."),
              ];
      if (pressureEffects.waitHeatInc > 0) {
        stateDeltas.push(
          makeDerivedStatDelta(
            `wait.heat.turn_${args.turnIndex}`,
            "Heat",
            Number(existingStats.heat ?? 0),
            Number(existingStats.heat ?? 0) + pressureEffects.waitHeatInc,
            `Because you waited while pressure was ${stage}, ambient danger rose further.`,
          ),
        );
      }
      if (pressureEffects.waitAlertInc > 0) {
        const alertBase = applyDeltas(normalizedState as any, stateDeltas as any) as Record<string, unknown>;
        stateDeltas.push(
          makeClockDelta(
            alertBase,
            DEFAULT_ALERT_CLOCK_ID,
            pressureEffects.waitAlertInc,
            "Alert",
            `Because you waited while pressure was ${stage}, hostile attention intensified.`,
          ),
        );
      }
      ledgerAdds = [
        {
          cause: "delay",
          effect:
            outcome === "SUCCESS"
              ? "Holding steady reveals useful timing."
              : outcome === "SUCCESS_WITH_COST"
                ? "The pause buys clarity, but the world uses the same time to tighten."
                : "Waiting concedes pressure, but it also makes the next threat legible.",
          detail:
            outcome === "SUCCESS"
              ? "By not acting too early, you read the room before it breaks."
              : outcome === "SUCCESS_WITH_COST"
                ? "By holding position, you gain information while alert pressure rises."
                : "By waiting under strain, you let both noise and alert build enough to expose the next danger.",
          action,
          outcome,
          summary,
        },
      ];
      if (pressureEffects.waitHeatInc > 0 || pressureEffects.waitAlertInc > 0) {
        ledgerAdds.push({
          cause: "pressure",
          effect: `Because you waited while pressure was ${stage}, hostile attention intensified.`,
          detail: "Waiting is no longer neutral once the system is already hot; the world uses the pause to worsen your position.",
          action,
          outcome,
          summary,
          stage,
        });
      }
      break;
    case "OBSERVE":
    default:
      if (playerIntentMode !== "LOOK") {
        stateDeltas = [];
        ledgerAdds = [];
        break;
      }
      scene =
        outcome === "SUCCESS"
          ? `${scene} ${observeClue.detail}`
          : outcome === "SUCCESS_WITH_COST"
            ? `${scene} ${observeClue.detail} The extra time spent reading the scene gives the pressure room to build.`
            : `${scene} ${observeClue.detail} Even the imperfect read tells you what part of the scene has been disturbed.`;
      stateDeltas =
        outcome === "SUCCESS"
          ? [
              makeInventoryAddDelta(
                {
                  id: observeClue.id,
                  name: observeClue.name,
                  qty: 1,
                  tags: ["clue", "observe"],
                },
                observeClue.detail,
              ),
              makeFlagDelta(`observed.turn_${args.turnIndex}`, true, "You now have a verified read on the scene.", "Insight"),
              makeTimeDelta(
                normalizedState,
                pressureEffects.observeTimeInc,
                pressureEffects.observeTimeInc > 1
                  ? "You take longer than expected to study the area under mounting pressure."
                  : "Careful inspection takes time, even when it pays off cleanly.",
              ),
            ]
          : outcome === "SUCCESS_WITH_COST"
            ? [
                makeInventoryAddDelta(
                  {
                    id: observeClue.id,
                    name: observeClue.name,
                    qty: 1,
                    tags: ["clue", "observe"],
                },
                observeClue.detail,
              ),
                makeTimeDelta(
                  normalizedState,
                  pressureEffects.observeTimeInc,
                  pressureEffects.observeTimeInc > 1
                    ? "Pressure at this stage slows careful observation and costs extra time."
                    : "The inspection takes long enough to slow your momentum.",
                ),
                makeClockDelta(normalizedState, DEFAULT_ALERT_CLOCK_ID, 1, "Alert", "The extra attention needed for the search raises suspicion."),
              ]
            : [
                makeInventoryAddDelta(
                  {
                    id: `${observeClue.id}_partial`,
                    name: `${observeClue.name} (partial)`,
                    qty: 1,
                    tags: ["clue", "observe", "partial"],
                  },
                  `You only get a partial read, but ${observeClue.detail.toLowerCase()}`,
                ),
                makeTimeDelta(
                  normalizedState,
                  pressureEffects.observeTimeInc,
                  pressureEffects.observeTimeInc > 1
                    ? "Pressure drags the uncertain search out longer than usual."
                    : "The uncertain search still costs time.",
                ),
                makeClockDelta(normalizedState, DEFAULT_ALERT_CLOCK_ID, 1, "Alert", "The failed read gives the threat time to narrow in."),
                makeFlagDelta(`observed.risk_${args.turnIndex}`, true, "Even the failed search reveals where the next danger will come from.", "Risk exposed"),
              ];
      ledgerAdds = [
        {
          cause: "observation",
          effect:
            outcome === "SUCCESS"
              ? "Careful inspection reveals physical evidence you can act on immediately."
              : outcome === "SUCCESS_WITH_COST"
                ? "You recover concrete evidence, but the extra time spent studying the scene allows pressure to build."
                : "The read is incomplete, but it still exposes where the next pressure will come from.",
          detail:
            outcome === "SUCCESS"
              ? `${observeClue.detail} Careful inspection turns that detail into usable evidence.`
              : outcome === "SUCCESS_WITH_COST"
                ? `${observeClue.detail} The extra time spent studying the scene gives the alert clock room to climb.`
                : `${observeClue.detail} Even without a clean answer, the disturbance shows you where danger is gathering.`,
          action,
          outcome,
          summary,
        },
      ];
      if (pressureEffects.observeTimeInc > 1) {
        ledgerAdds.push({
          cause: "pressure",
          effect: `Pressure at ${stage} slowed careful observation, costing extra time.`,
          detail: "The environment is hot enough that careful study now consumes more of the turn than it would in calm conditions.",
          action,
          outcome,
          summary,
          stage,
        });
      }
      break;
  }

  resolution = {
    outcome: outcomeLabel(outcome),
    notes:
      outcome === "SUCCESS"
        ? `${action} creates momentum without giving much back.`
        : outcome === "SUCCESS_WITH_COST"
          ? `${action} works, but it also raises visible pressure in the world state.`
          : `${action} does not land cleanly, yet it still changes the scene and opens the next option.`,
    action,
  };

  const intermediateAppliedState = applyDeltas(normalizedState as any, stateDeltas as any) as Record<string, unknown>;
  const intermediateNextState = projectReadableState(
    normalizedState,
    intermediateAppliedState,
    action,
    outcome,
    args.turnIndex,
    pressureEffects,
  );
  const previousStage = pressureStage(normalizedState);
  const nextStage = pressureStage(intermediateNextState);

  if (pressureRank(nextStage) > pressureRank(previousStage) && nextStage !== "calm") {
    stateDeltas.push(
      makeFlagDelta(
        pressureFlagKey(nextStage),
        true,
        `Pressure has crossed into ${nextStage}, and later turns should react accordingly.`,
        "Pressure stage",
      ),
    );
    ledgerAdds.push({
      cause: "pressure",
      effect:
        nextStage === "tension"
          ? "Pressure has started to tighten around the scene."
          : nextStage === "danger"
            ? "Pressure has escalated into open danger."
            : "Pressure has broken into outright crisis.",
      detail:
        nextStage === "tension"
          ? "Enough alert, noise, or heat has accumulated that the world is now actively focusing on you."
          : nextStage === "danger"
            ? "The situation has moved beyond background risk and is now escalating in plain sight."
            : "The accumulated pressure is high enough that the situation is close to breaking.",
      action,
      outcome,
      summary,
      stage: nextStage,
      refTurnIndex: args.turnIndex,
    });
    scene = applyPressureToScene(scene, nextStage);
  }

  const preReactionState = applyDeltas(normalizedState as any, stateDeltas as any) as Record<string, unknown>;
  let nextState = projectReadableState(
    normalizedState,
    preReactionState,
    action,
    outcome,
    args.turnIndex,
    pressureEffects,
  );

  applyPostTurnReactions({
    nextState,
    stateDeltas,
    ledgerAdds,
    action,
    outcome,
    summary,
    turnIndex: args.turnIndex,
  });

  const postReactionState = applyDeltas(normalizedState as any, stateDeltas as any) as Record<string, unknown>;
  nextState = projectReadableState(
    normalizedState,
    postReactionState,
    action,
    outcome,
    args.turnIndex,
    pressureEffects,
  );

  evaluateQuestTriggers({
    nextState,
    stateDeltas,
    ledgerAdds,
  });

  const finalAppliedState = applyDeltas(normalizedState as any, stateDeltas as any) as Record<string, unknown>;
  nextState = projectReadableState(
    normalizedState,
    finalAppliedState,
    action,
    outcome,
    args.turnIndex,
    pressureEffects,
  );

  let resolvedTurn = {
    action,
    outcome,
    scene,
    resolution,
    stateDeltas,
    ledgerAdds,
    nextState,
  };

  if (playerIntentMode !== "LOOK") {
    resolvedTurn.stateDeltas = resolvedTurn.stateDeltas.filter((delta) => {
      const op = (delta as any).op ?? null;
      const kind = (delta as any).kind ?? null;
      const key = (delta as any).key ?? null;
      const keyStr = typeof key === "string" ? key : null;
      if (op === "inv.add") return false;
      if (op === "time.inc") return false;
      if (op === "flag.set" && keyStr?.startsWith("observed.")) return false;
      if (op === "flag.set" && keyStr === "knowledge.gained") return false;
      if (kind === "flag.set" && keyStr === "knowledge.gained") return false;
      return true;
    });
    resolvedTurn.ledgerAdds = resolvedTurn.ledgerAdds.filter((entry) => {
      const cause = (entry as any).cause;
      const actionName = (entry as any).action;
      if (cause === "observation") return false;
      if (actionName === "OBSERVE") return false;
      return true;
    });
  }

  return resolvedTurn;
}
