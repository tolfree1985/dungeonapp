import { WORLD_FLAGS } from "@/lib/engine/worldFlags";
import type { OpportunityWindowState } from "@/lib/opportunity-window";

export type OpportunityQuality = "clean" | "contested";

export type OpportunityCooldownEntry = {
  reason: "expired" | "consumed" | "invalidated";
  atTurn: number;
  expiresAtTurn: number;
  blockingConditions: Record<string, boolean>;
  clearedAtTurn?: number | null;
  clearedReason?: "state-changed" | "expired" | null;
};

type OpportunityWindowStatus = "active" | "consumed" | "expired";

type OpportunityTruthLike = {
  rulesTriggered: Array<{
    ruleId: string;
    matchedConditions: Array<Record<string, unknown>>;
    effects: Array<Record<string, unknown>>;
  }>;
} | null | undefined;

export type OpportunityWindowLifecycleState = {
  type: string;
  source: string;
  quality?: OpportunityQuality;
  createdAtTurn: number;
  consumableOnTurn: number;
  expiresAtTurn: number;
  expiresAt: number;
  conditions: Record<string, unknown>;
  status: OpportunityWindowStatus;
  createdTurnIndex: number;
  consumedTurnIndex?: number | null;
};

export type OpportunityWindowLifecycleLedgerEntry = Record<string, unknown>;

export type OpportunityBenefit = {
  kind: "reduced_cost";
  source: "hidden_window";
  quality: OpportunityQuality;
  prevented: string[];
  detail: string;
};

type OpportunityBlueprint = {
  type: string;
  source: string;
  ttl: number;
  conditions: Record<string, unknown>;
  quality: OpportunityQuality;
};

function buildOpportunityWindowLedgerWindow(window: OpportunityWindowLifecycleState): Record<string, unknown> {
  return {
    type: window.type,
    createdTurn: window.createdTurnIndex,
    expiresAt: window.expiresAt,
    source: window.source,
    quality: window.quality ?? "clean",
    status: window.status,
    consumedTurnIndex: window.consumedTurnIndex ?? null,
  };
}

function isRecordLike(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function hasTriggeredRules(truth: OpportunityTruthLike): boolean {
  return Boolean(truth?.rulesTriggered?.length);
}

function normalizeSceneText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

function readStateFlags(state: unknown): Record<string, unknown> {
  const root = asRecord(state);
  if (!root) return {};
  const directFlags = asRecord(root.flags);
  if (directFlags) return directFlags;
  const world = asRecord(root.world);
  const worldFlags = asRecord(world?.flags);
  return worldFlags ?? {};
}

function deriveShadowHideBlockingConditions(state: unknown): Record<string, boolean> {
  const flags = readStateFlags(state);
  const blockingKeys = [
    WORLD_FLAGS.guard.searching,
    WORLD_FLAGS.status.exposed,
    WORLD_FLAGS.player.revealed,
    WORLD_FLAGS.guard.alerted,
  ];
  return blockingKeys.reduce<Record<string, boolean>>((acc, key) => {
    if (flags[key] === true) {
      acc[key] = true;
    }
    return acc;
  }, {});
}

function readStateSceneText(state: unknown): string {
  const root = asRecord(state);
  if (!root) return "";
  const currentScene = asRecord(root.currentScene);
  const currentSceneText = normalizeSceneText(currentScene?.text);
  if (currentSceneText) return currentSceneText;
  const sceneText = normalizeSceneText(root.scene ?? root.sceneText ?? "");
  if (sceneText) return sceneText;
  return normalizeSceneText(root.currentSceneText ?? "");
}

function pickOpportunityBlueprint(params: {
  opportunityTruth: OpportunityTruthLike;
  opportunityWindowState: OpportunityWindowState;
  sceneClock: number;
  turnIndex: number;
  normalizedInput: string;
  opportunityQuality: OpportunityQuality;
}): OpportunityBlueprint | null {
  const firstRule = params.opportunityTruth?.rulesTriggered?.[0];
  if (!firstRule) return null;

  const conditions: Record<string, unknown> = {
    ruleId: firstRule.ruleId,
    matchedConditions: firstRule.matchedConditions,
    opportunityTier: params.opportunityWindowState.opportunityTier,
    windowNarrowed: params.opportunityWindowState.windowNarrowed,
    quality: params.opportunityQuality,
    sceneClock: params.sceneClock,
    turnIndex: params.turnIndex,
    normalizedInput: params.normalizedInput,
  };

  if (firstRule.ruleId === "SHADOW_HIDE_OPPORTUNITY") {
    return {
      type: "shadow_hide",
      source: "environment.shadow",
      quality: params.opportunityQuality,
      ttl: 2,
      conditions: {
        ...conditions,
        requiredSceneIncludes: ["shadow"],
      },
    };
  }

  if (
    firstRule.ruleId === "HIDDEN_STATE_CONCEALMENT_OPPORTUNITY" ||
    firstRule.ruleId === "HIDDEN_STATE_CONCEALMENT_OPPORTUNITY_CONTESTED" ||
    firstRule.ruleId === "HIDE_BASELINE_OPPORTUNITY"
  ) {
    return {
      type: "shadow_hide",
      source: "environment.shadow",
      quality: params.opportunityQuality,
      ttl: 1,
      conditions: {
        ...conditions,
        source: "hidden_state",
        contested: params.opportunityQuality === "contested",
      },
    };
  }

  if (firstRule.ruleId === "OPPORTUNITY_WINDOW_REDUCED_BY_TIME_PRESSURE") {
    return {
      type: "time_pressure",
      source: "scene.time",
      quality: params.opportunityQuality,
      ttl: 1,
      conditions,
    };
  }

  if (firstRule.ruleId === "OPPORTUNITY_WINDOW_REDUCED_BY_FINALIZED_EFFECTS") {
    return {
      type: "finalized_effects",
      source: "scene.effects",
      quality: params.opportunityQuality,
      ttl: 1,
      conditions,
    };
  }

  return {
    type: params.opportunityWindowState.windowNarrowed ? "reduced_window" : "opportunity_window",
    source: "system.opportunity",
    quality: params.opportunityQuality,
    ttl: params.opportunityWindowState.windowNarrowed ? 1 : 2,
    conditions,
  };
}

function isOpportunityWindowStillValid(params: {
  opportunityWindow: OpportunityWindowLifecycleState;
  state: unknown;
  sceneClock: number;
}): { valid: boolean; reason: string | null } {
  const { opportunityWindow, state, sceneClock } = params;
  if (sceneClock > opportunityWindow.expiresAtTurn) {
    return { valid: false, reason: "expired" };
  }

  const conditions = asRecord(opportunityWindow.conditions);
  const invalidatedByFlags = Array.isArray(conditions?.invalidatedByFlags)
    ? conditions?.invalidatedByFlags.filter((value): value is string => typeof value === "string")
    : [];
  const requiredSceneIncludes = Array.isArray(conditions?.requiredSceneIncludes)
    ? conditions?.requiredSceneIncludes.filter((value): value is string => typeof value === "string")
    : [];
  const flags = readStateFlags(state);
  for (const flag of invalidatedByFlags) {
    if (flags[flag] === true) {
      return { valid: false, reason: `flag.${flag}` };
    }
  }

  const sceneText = readStateSceneText(state);
  for (const fragment of requiredSceneIncludes) {
    if (sceneText && !sceneText.includes(fragment.toLowerCase())) {
      return { valid: false, reason: `scene.${fragment}.missing` };
    }
  }

  return { valid: true, reason: null };
}

export function settleOpportunityWindowValidity(params: {
  opportunityWindow: unknown;
  state: unknown;
  sceneClock: number;
}): {
  opportunityWindow: OpportunityWindowLifecycleState | null;
  ledgerAdds: OpportunityWindowLifecycleLedgerEntry[];
  transition: "none" | "persisted" | "invalidated" | "expired";
} {
  const ledgerAdds: OpportunityWindowLifecycleLedgerEntry[] = [];
  const opportunityWindow = normalizeOpportunityWindowState(params.opportunityWindow);
  if (!opportunityWindow) {
    return { opportunityWindow: null, ledgerAdds, transition: "none" };
  }

  const validity = isOpportunityWindowStillValid({
    opportunityWindow,
    state: params.state,
    sceneClock: params.sceneClock,
  });
  if (!validity.valid) {
    ledgerAdds.push({
      kind: "opportunity.window",
      cause: "opportunity.invalidated",
      effect: "window.closed",
      detail:
        validity.reason === "expired"
          ? `The ${opportunityWindow.type} opportunity expires before it can be used.`
          : `The ${opportunityWindow.type} opportunity is lost when ${validity.reason} changes the state.`,
      data: {
        opportunityId: `${opportunityWindow.type}:${opportunityWindow.createdTurnIndex}`,
        source: opportunityWindow.source,
        reason: validity.reason,
        expiresAt: opportunityWindow.expiresAt,
        sceneClock: params.sceneClock,
        createdTurnIndex: opportunityWindow.createdTurnIndex,
        window: buildOpportunityWindowLedgerWindow(opportunityWindow),
      },
    });
    return {
      opportunityWindow: null,
      ledgerAdds,
      transition: validity.reason === "expired" ? "expired" : "invalidated",
    };
  }

  return {
    opportunityWindow,
    ledgerAdds,
    transition: "persisted",
  };
}

function normalizeCooldownEntry(value: unknown): OpportunityCooldownEntry | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return {
      reason: "expired",
      atTurn: value,
      expiresAtTurn: value,
      blockingConditions: {},
    };
  }
  if (!isRecordLike(value)) return null;
  const reason =
    value.reason === "consumed" || value.reason === "invalidated" || value.reason === "expired"
      ? value.reason
      : "expired";
  const atTurn =
    typeof value.atTurn === "number" && Number.isFinite(value.atTurn) ? value.atTurn : NaN;
  const expiresAtTurn =
    typeof value.expiresAtTurn === "number" && Number.isFinite(value.expiresAtTurn)
      ? value.expiresAtTurn
      : Number.isFinite(atTurn)
        ? atTurn + 1
        : NaN;
  const blockingConditions = isRecordLike(value.blockingConditions)
    ? Object.entries(value.blockingConditions).reduce<Record<string, boolean>>((acc, [key, flagValue]) => {
        if (flagValue === true) acc[key] = true;
        return acc;
      }, {})
    : {};
  if (!Number.isFinite(atTurn) || !Number.isFinite(expiresAtTurn)) return null;
  return {
    reason,
    atTurn,
    expiresAtTurn,
    blockingConditions,
    clearedAtTurn:
      typeof value.clearedAtTurn === "number" && Number.isFinite(value.clearedAtTurn)
        ? value.clearedAtTurn
        : null,
    clearedReason:
      value.clearedReason === "state-changed" || value.clearedReason === "expired"
        ? value.clearedReason
        : null,
  };
}

export function settleOpportunityCooldowns(params: {
  opportunityCooldowns: unknown;
  state: unknown;
  sceneClock: number;
}): {
  opportunityCooldowns: Record<string, OpportunityCooldownEntry>;
  ledgerAdds: OpportunityWindowLifecycleLedgerEntry[];
} {
  const rawCooldowns = isRecordLike(params.opportunityCooldowns) ? params.opportunityCooldowns : {};
  const normalized: Record<string, OpportunityCooldownEntry> = {};
  const ledgerAdds: OpportunityWindowLifecycleLedgerEntry[] = [];
  const stateFlags = readStateFlags(params.state);

  for (const [key, value] of Object.entries(rawCooldowns)) {
    const cooldown = normalizeCooldownEntry(value);
    if (!cooldown) continue;
    const conditionsStillHold = Object.entries(cooldown.blockingConditions).every(
      ([flagKey, requiredValue]) => stateFlags[flagKey] === requiredValue,
    );
    const expired = params.sceneClock > cooldown.expiresAtTurn;
    if (!conditionsStillHold || expired) {
      ledgerAdds.push({
        kind: "opportunity.cooldown",
        cause: expired ? "opportunity.cooldown.expired" : "opportunity.cooldown.cleared",
        effect: "opportunity.cooldown-removed",
        detail:
          expired
            ? `Cooldown for ${key} expires after its guard state has already passed.`
            : `Cooldown for ${key} clears because the blocking state changed.`,
        data: {
          type: key,
          reason: cooldown.reason,
          atTurn: cooldown.atTurn,
          expiresAtTurn: cooldown.expiresAtTurn,
          clearedAtTurn: params.sceneClock,
          clearedReason: expired ? "expired" : "state-changed",
          blockingConditions: cooldown.blockingConditions,
        },
      });
      continue;
    }
    normalized[key] = cooldown;
  }

  return { opportunityCooldowns: normalized, ledgerAdds };
}

function normalizeOpportunityWindowState(value: unknown): OpportunityWindowLifecycleState | null {
  const record = asRecord(value);
  if (!record) return null;
  const type = typeof record.type === "string" && record.type.trim() ? record.type.trim() : "";
  const source = typeof record.source === "string" && record.source.trim() ? record.source.trim() : "";
  const quality = record.quality === "contested" ? "contested" : "clean";
  const createdAtTurn =
    typeof record.createdAtTurn === "number" && Number.isFinite(record.createdAtTurn)
      ? record.createdAtTurn
      : typeof record.createdTurnIndex === "number" && Number.isFinite(record.createdTurnIndex)
        ? record.createdTurnIndex
        : NaN;
  const consumableOnTurn =
    typeof record.consumableOnTurn === "number" && Number.isFinite(record.consumableOnTurn)
      ? record.consumableOnTurn
      : Number.isFinite(createdAtTurn)
        ? createdAtTurn + 1
        : NaN;
  const expiresAtTurn =
    typeof record.expiresAtTurn === "number" && Number.isFinite(record.expiresAtTurn)
      ? record.expiresAtTurn
      : typeof record.expiresAt === "number" && Number.isFinite(record.expiresAt)
        ? record.expiresAt
        : Number.isFinite(consumableOnTurn)
          ? consumableOnTurn
          : NaN;
  const expiresAt = expiresAtTurn;
  const createdTurnIndex =
    typeof record.createdTurnIndex === "number" && Number.isFinite(record.createdTurnIndex)
      ? record.createdTurnIndex
      : Number.isFinite(createdAtTurn)
        ? createdAtTurn
        : -1;
  const status =
    record.status === "active" || record.status === "consumed" || record.status === "expired"
      ? record.status
      : null;
  if (
    !type ||
    !source ||
    !Number.isFinite(createdAtTurn) ||
    !Number.isFinite(consumableOnTurn) ||
    !Number.isFinite(expiresAtTurn) ||
    !status ||
    createdTurnIndex < 0
  ) {
    return null;
  }
  const conditions = asRecord(record.conditions) ?? {};
  const consumedTurnIndex =
    typeof record.consumedTurnIndex === "number" && Number.isFinite(record.consumedTurnIndex)
      ? record.consumedTurnIndex
      : null;
  return {
    type,
    source,
    quality,
    createdAtTurn,
    consumableOnTurn,
    expiresAtTurn,
    expiresAt,
    conditions,
    status,
    createdTurnIndex,
    consumedTurnIndex,
  };
}

function isActiveWindow(
  window: OpportunityWindowLifecycleState | null,
  sceneClock: number,
): window is OpportunityWindowLifecycleState {
  return Boolean(
    window &&
      window.status === "active" &&
      sceneClock >= window.consumableOnTurn &&
      sceneClock <= window.expiresAtTurn,
  );
}

function actionUsesOpportunityWindow(params: {
  action: string;
  normalizedInput: string;
  window: OpportunityWindowLifecycleState;
}): boolean {
  const normalizedInput = params.normalizedInput.toLowerCase();
  if (params.window.type === "shadow_hide") {
    return (
      normalizedInput.includes("hide") ||
      normalizedInput.includes("strike") ||
      normalizedInput.includes("attack") ||
      normalizedInput.includes("ambush") ||
      params.action === "STEALTH"
    );
  }
  return false;
}

function isHiddenStrikeLikeInput(normalizedInput: string): boolean {
  return (
    normalizedInput.includes("strike") ||
    normalizedInput.includes("attack") ||
    normalizedInput.includes("ambush")
  );
}

export function deriveOpportunityBenefit(params: {
  previousWindow: OpportunityWindowLifecycleState | null;
  stateFlags?: Record<string, unknown> | null;
  normalizedInput: string;
  action: string;
}): OpportunityBenefit | null {
  if (!params.previousWindow || params.previousWindow.type !== "shadow_hide") {
    return null;
  }
  if (params.action !== "DO") {
    return null;
  }

  const normalizedInput = params.normalizedInput.toLowerCase();
  if (!isHiddenStrikeLikeInput(normalizedInput)) {
    return null;
  }

  const quality = params.previousWindow.quality ?? "clean";
  const prevented = ["noise increase"];
  const flags = params.stateFlags ?? {};
  if (
    quality !== "contested" &&
    (Boolean(flags[WORLD_FLAGS.guard.alerted]) ||
      Boolean(flags[WORLD_FLAGS.guard.searching]) ||
      Boolean(flags[WORLD_FLAGS.status.exposed]))
  ) {
    prevented.push("alert increase");
  }

  return {
    kind: "reduced_cost",
    source: "hidden_window",
    quality,
    prevented,
    detail:
      quality === "contested"
        ? "You still exploit the opening, but the room stays tense enough to blunt the follow-through."
        : "Hidden position lets the strike land without drawing the room's full attention.",
  };
}

export function evolveOpportunityWindow(params: {
  previousWindow: unknown;
  opportunityTruth: OpportunityTruthLike;
  opportunityWindowState: OpportunityWindowState;
  sceneClock: number;
  turnIndex: number;
  action: string;
  normalizedInput: string;
  opportunityCooldowns?: Record<string, OpportunityCooldownEntry | number>;
}): {
  opportunityWindow: OpportunityWindowLifecycleState | null;
  ledgerAdds: OpportunityWindowLifecycleLedgerEntry[];
  transition: "none" | "created" | "persisted" | "consumed" | "expired";
} {
  const ledgerAdds: OpportunityWindowLifecycleLedgerEntry[] = [];
  const previousWindow = normalizeOpportunityWindowState(params.previousWindow);
  const hasOpportunity = hasTriggeredRules(params.opportunityTruth);
  const blueprint = pickOpportunityBlueprint({
    opportunityTruth: params.opportunityTruth,
    opportunityWindowState: params.opportunityWindowState,
    sceneClock: params.sceneClock,
    turnIndex: params.turnIndex,
    normalizedInput: params.normalizedInput,
    opportunityQuality:
      params.opportunityTruth?.quality === "contested" ? "contested" : "clean",
  });

  if (previousWindow && previousWindow.expiresAt <= params.sceneClock) {
    ledgerAdds.push({
      kind: "opportunity.window",
      cause: "opportunity.expired",
      effect: "window.closed",
      detail: `The ${previousWindow.type} opportunity expires before it can be used.`,
      data: {
        source: previousWindow.source,
        expiresAt: previousWindow.expiresAt,
        sceneClock: params.sceneClock,
        turnIndex: params.turnIndex,
        window: buildOpportunityWindowLedgerWindow(previousWindow),
      },
    });
    if (!blueprint) {
      return { opportunityWindow: null, ledgerAdds, transition: "expired" };
    }
  }

  if (previousWindow && isActiveWindow(previousWindow, params.sceneClock)) {
    if (actionUsesOpportunityWindow({
      action: params.action,
      normalizedInput: params.normalizedInput,
      window: previousWindow,
    })) {
      ledgerAdds.push({
        kind: "opportunity.window",
        cause: "opportunity.consumed",
        effect: "opportunity.window-used",
        detail: `The ${previousWindow.type} opportunity is consumed by the current action.`,
      data: {
        source: previousWindow.source,
        consumedTurnIndex: params.turnIndex,
        sceneClock: params.sceneClock,
        window: buildOpportunityWindowLedgerWindow({
          ...previousWindow,
          status: "consumed",
          consumedTurnIndex: params.turnIndex,
        }),
      },
    });
      return { opportunityWindow: null, ledgerAdds, transition: "consumed" };
    }

    return { opportunityWindow: previousWindow, ledgerAdds, transition: "persisted" };
  }

  if (!hasOpportunity || !blueprint) {
    return {
      opportunityWindow: previousWindow && isActiveWindow(previousWindow, params.sceneClock) ? previousWindow : null,
      ledgerAdds,
      transition: previousWindow ? "persisted" : "none",
    };
  }

  const cooldownUntil = normalizeCooldownEntry(params.opportunityCooldowns?.[blueprint.type]);
  if (cooldownUntil && params.sceneClock <= cooldownUntil.expiresAtTurn) {
    ledgerAdds.push({
      kind: "opportunity.window-pressure",
      cause: "opportunity.cooldown",
      effect: "opportunity.window-suppressed",
      detail: `The ${blueprint.type} opportunity cannot immediately re-form after it expires.`,
      data: {
        source: blueprint.source,
        cooldownUntilTurn: cooldownUntil.expiresAtTurn,
        sceneClock: params.sceneClock,
        turnIndex: params.turnIndex,
      },
    });
    return {
      opportunityWindow: null,
      ledgerAdds,
      transition: "expired",
    };
  }

  const nextWindow: OpportunityWindowLifecycleState = {
    type: blueprint.type,
    source: blueprint.source,
    quality: blueprint.quality,
    createdAtTurn: params.sceneClock,
    consumableOnTurn: params.sceneClock + 1,
    expiresAtTurn: params.sceneClock + blueprint.ttl,
    expiresAt: params.sceneClock + blueprint.ttl,
    conditions: blueprint.conditions,
    status: "active",
    createdTurnIndex: params.turnIndex,
  };
  ledgerAdds.push({
    kind: "opportunity.window",
    cause: "opportunity.created",
    effect: "opportunity.window-created",
    detail: `A ${nextWindow.type} opportunity becomes available.`,
    data: {
      source: nextWindow.source,
      expiresAt: nextWindow.expiresAt,
      sceneClock: params.sceneClock,
      turnIndex: params.turnIndex,
      opportunityTier: params.opportunityWindowState.opportunityTier,
      window: buildOpportunityWindowLedgerWindow(nextWindow),
    },
  });
  return { opportunityWindow: nextWindow, ledgerAdds, transition: previousWindow ? "created" : "created" };
}
