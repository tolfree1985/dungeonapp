// src/lib/turnHandler.ts
import { prisma } from "@/lib/prisma";

import { createInitialStateV1 } from "@/lib/game/bootstrap";
import { applyDeltas } from "@/lib/game/state";
import { runEngineTurn } from "@/lib/game/engine";

const ROUTE_VERSION = "turn-handler-contract-2026-02-10-0906Z";
const ENGINE_BUILD = "ENGINE_CONTRACT_V1";

// 🔎 Marker so we can prove this exact file version is running
const HANDLER_PATCH_MARKER = "HANDLER_PATCH_STATE_REPAIR_2026-02-11C";

// COST DISCIPLINE CONTRACT (handler-level, deterministic)
// - No unlimited tiers
// - Enforce turn caps per adventure (MVP: per-adventure lifetime; no monthly persistence yet)
// - Regen counts as a turn-equivalent action (optional; counts toward regen cap too)
// - Token caps are surfaced for future narrator/model wiring
type TierId = "free" | "explorer" | "adventurer" | "architect";

type CostCaps = {
  tier: TierId;
  maxTurnsPerPeriod: number; // MVP: per-adventure lifetime
  maxInputTokens: number;
  maxOutputTokens: number;
  softOutputTokens: number; // deterministic clamp target
  maxRegensPerPeriod: number; // MVP: per-adventure lifetime
};

const COST_CAPS: Record<TierId, CostCaps> = {
  free: {
    tier: "free",
    maxTurnsPerPeriod: 80,
    maxInputTokens: 1800,
    maxOutputTokens: 500,
    softOutputTokens: 350,
    maxRegensPerPeriod: 10,
  },
  explorer: {
    tier: "explorer",
    maxTurnsPerPeriod: 500,
    maxInputTokens: 2600,
    maxOutputTokens: 700,
    softOutputTokens: 520,
    maxRegensPerPeriod: 50,
  },
  adventurer: {
    tier: "adventurer",
    maxTurnsPerPeriod: 1500,
    maxInputTokens: 4200,
    maxOutputTokens: 900,
    softOutputTokens: 720,
    maxRegensPerPeriod: 120,
  },
  architect: {
    tier: "architect",
    maxTurnsPerPeriod: 3500,
    maxInputTokens: 8000,
    maxOutputTokens: 1200,
    softOutputTokens: 1000,
    maxRegensPerPeriod: 300,
  },
};

type CostDecision =
  | {
      ok: true;
      tier: TierId;
      maxInputTokens: number;
      maxOutputTokens: number;
      clampedOutputTokens: number;
      warnings: string[];
    }
  | {
      ok: false;
      tier: TierId;
      code: "TURN_CAP" | "REGEN_CAP";
      message: string;
    };

function enforceCostDiscipline(args: {
  tier: TierId;
  nextTurnIndex: number; // 0-based index
  regensUsedInPeriod: number;
  isRegen: boolean;
}): CostDecision {
  const caps = COST_CAPS[args.tier];
  const warnings: string[] = [];

  const turnsUsed = Math.max(0, args.nextTurnIndex);
  if (turnsUsed >= caps.maxTurnsPerPeriod) {
    return {
      ok: false,
      tier: args.tier,
      code: "TURN_CAP",
      message: `Turn cap reached for tier=${args.tier}.`,
    };
  }

  const regensUsed = Math.max(0, args.regensUsedInPeriod);
  const regensAfter = regensUsed + (args.isRegen ? 1 : 0);
  if (regensAfter > caps.maxRegensPerPeriod) {
    return {
      ok: false,
      tier: args.tier,
      code: "REGEN_CAP",
      message: `Regen cap reached for tier=${args.tier}.`,
    };
  }

  // Deterministic clamp: never exceed softOutputTokens even if tier allows more.
  const clampedOutputTokens = Math.min(caps.maxOutputTokens, caps.softOutputTokens);

  if (turnsUsed >= Math.floor(caps.maxTurnsPerPeriod * 0.9)) {
    warnings.push("Approaching turn cap; output may be shortened.");
  }

  return {
    ok: true,
    tier: args.tier,
    maxInputTokens: caps.maxInputTokens,
    maxOutputTokens: caps.maxOutputTokens,
    clampedOutputTokens,
    warnings,
  };
}

type LedgerEntry = { id: string; cause: string; effect: string; tags?: string[] };
type Option = { id: string; label: string; intent: string };

function toLedgerEntries(ledgerAdds: any[]): LedgerEntry[] {
  const arr = Array.isArray(ledgerAdds) ? ledgerAdds : [];
  return arr.map((e, i) => ({
    id: `L${i + 1}`,
    cause: String(e?.type ?? "note"),
    effect: String(e?.summary ?? ""),
    tags: e?.type ? [String(e.type)] : undefined,
  }));
}

/**
 * Deterministic 32-bit seed derived from adventureId.
 * ✅ No Date.now()
 * ✅ No Math.random()
 */
function seedFromAdventureId(adventureId: string): number {
  let h = 0x811c9dc5 | 0;
  for (let i = 0; i < adventureId.length; i++) {
    h ^= adventureId.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) | 0;
  }
  return h | 0;
}

/**
 * If state is corrupted (missing `world`), reset deterministically.
 * Best-effort salvage of intercepts.
 */
function sanitizeStateOrReset(prevState: any): { state: any; repaired: boolean } {
  if (prevState && typeof prevState === "object" && prevState.world) {
    return { state: prevState, repaired: false };
  }

  const salvagedIntercepts = prevState?.intercepts;

  const fresh = createInitialStateV1() as any;
  if (salvagedIntercepts) fresh.intercepts = salvagedIntercepts;

  fresh.world.flags = fresh.world.flags ?? {};
  fresh.world.flags.stateRepairApplied = true;

  return { state: fresh, repaired: true };
}

function getTopActiveIntercept(nextState: any, turnIndex: number): any | null {
  const raw = nextState?.intercepts;

  // Supported shapes:
  // - array of intercepts
  // - { intercepts: [...] }
  // - legacy { active: [...] }
  const arr: any[] = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.intercepts)
      ? raw.intercepts
      : Array.isArray(raw?.active)
        ? raw.active
        : [];

  if (!Array.isArray(arr) || arr.length === 0) return null;

  const live = arr
    .filter((i) => i && typeof i === "object")
    .filter((i) => i.deleted !== true)
    .filter((i) => (i.expiresTurn == null ? true : Number(i.expiresTurn) > turnIndex))
    .slice()
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));

  return live[0] ?? null;
}

// ✅ Output-boundary guarantee: if an intercept is active, "intercept.handle" is option[0]
function ensureInterceptHandleOption(nextState: any, turnIndex: number, options: Option[]) {
  const top = getTopActiveIntercept(nextState, turnIndex);
  if (!top) return options;

  const already = options.some((o) => o?.intent === "intercept.handle");
  if (already) return options;

  const kind = String(top.kind ?? "");
  return [
    {
      id: "opt_intercept",
      label:
        kind === "checkpoint"
          ? "Deal with the checkpoint"
          : kind === "patrol"
            ? "Deal with the patrol"
            : "Deal with the intercept",
      intent: "intercept.handle",
    },
    ...options,
  ];
}

export async function handleTurn(body: any) {
  const adventureId = String(body?.adventureId ?? "");
  const input = String(body?.input ?? body?.playerText ?? body?.playerInput ?? "");
  const narratorMode = String(body?.narratorMode ?? "stub");
  const sessionId = String(body?.sessionId ?? "");

  const requestDebug = (body as any)?.debug ?? null;

  // Tier selection (MVP: accept from body; replace with auth/user lookup later)
  const tier: TierId = (body?.tier as TierId) ?? "free";

  // Regen signal (MVP: client-provided)
  const isRegen = Boolean(body?.isRegen);

  if (!adventureId) {
    return {
      status: 400,
      json: { error: "Missing adventureId", routeVersion: ROUTE_VERSION, engineBuild: ENGINE_BUILD },
    };
  }
  if (!input) {
    return {
      status: 400,
      json: {
        error: "Missing input/playerText/playerInput",
        routeVersion: ROUTE_VERSION,
        engineBuild: ENGINE_BUILD,
      },
    };
  }

  const result = await prisma.$transaction(async (tx) => {
    const baseSeed = seedFromAdventureId(adventureId);

    const adv = await tx.adventure.upsert({
      where: { id: adventureId },
      update: {},
      create: {
        id: adventureId,
        latestTurnIndex: -1,
        seed: baseSeed,
        state: createInitialStateV1() as any,
      },
    });

    const seed = ((adv as any).seed ?? baseSeed) | 0;
    const nextIndex = (((adv as any).latestTurnIndex ?? -1) as number) + 1;

    // MVP regen usage tracking without new persistence:
    const regensUsedInPeriod = Number((adv as any).regensUsedInPeriod ?? 0);

    const decision = enforceCostDiscipline({
      tier,
      nextTurnIndex: nextIndex,
      regensUsedInPeriod,
      isRegen,
    });

    if (!decision.ok) {
      return {
        rejected: true as const,
        status: 402,
        json: {
          ok: false,
          error: decision.code,
          message: decision.message,
          routeVersion: ROUTE_VERSION,
          engineBuild: ENGINE_BUILD,
          handlerPatchMarker: HANDLER_PATCH_MARKER,
          tier,
        },
      };
    }

    // ✅ sanitize stored state before use
    const prevRaw: any = (adv as any).state ?? null;
    const { state: prevState, repaired } = sanitizeStateOrReset(prevRaw);

    const out = runEngineTurn({
      baseSeed: seed,
      turnIndex: nextIndex,
      playerText: input,
      state: prevState,
      debug: requestDebug,
      debugFlags: (body as any)?.debugFlags ?? undefined,
    });

    // EngineReturn is an ARRAY with `.deltas`
    const stateDeltasRaw = (out as any).deltas ?? out;
    const stateDeltas = Array.isArray(stateDeltasRaw) ? stateDeltasRaw : [];

    const nextState = applyDeltas(prevState, stateDeltas);

    // Placeholder view fields (until narrator layer is wired)
    const scene = String((body as any)?.sceneOverride ?? "");
    const resolution: any = null;
    const ledgerAdds: any[] = [];
    const baseOptions: Option[] = Array.isArray((body as any)?.optionsOverride)
      ? [...((body as any)?.optionsOverride as Option[])]
      : [];

    const options = ensureInterceptHandleOption(nextState, nextIndex, baseOptions).slice(0, 5);

    const debug = {
      routeVersion: ROUTE_VERSION,
      engineBuild: ENGINE_BUILD,
      narratorMode,
      sessionId,
      engine: { turnIndex: nextIndex, seed },
      requestDebug,
      handlerPatchMarker: HANDLER_PATCH_MARKER,
      stateRepairApplied: repaired,
      prevStateWasCorrupt: !prevRaw || !prevRaw.world,
      costDiscipline: {
        tier,
        maxInputTokens: decision.maxInputTokens,
        maxOutputTokens: decision.maxOutputTokens,
        clampedOutputTokens: decision.clampedOutputTokens,
        warnings: decision.warnings,
      },
    };

    const t = await tx.turn.create({
      data: {
        adventureId,
        turnIndex: nextIndex,
        playerInput: input,
        scene,
        resolution,
        stateDeltas: stateDeltas as any,
        ledgerAdds: ledgerAdds as any,
        debug: debug as any,
      },
      select: { id: true, adventureId: true, turnIndex: true, createdAt: true, debug: true },
    });

    await tx.adventure.update({
      where: { id: adventureId },
      data: {
        seed: seed as any,
        state: nextState as any,
        latestTurnIndex: nextIndex,
        ...(typeof (adv as any).regensUsedInPeriod === "number"
          ? { regensUsedInPeriod: regensUsedInPeriod + (isRegen ? 1 : 0) }
          : {}),
      } as any,
    });

    const view = {
      id: t.id,
      createdAt: t.createdAt,
      playerText: input,
      assistantText: scene,
      state: nextState,
      ledger: toLedgerEntries(ledgerAdds),
      options,
    };

    const engine = {
      stateDeltas,
      scene,
      resolution,
      ledgerAdds,
      options,
    };

    return { rejected: false as const, turn: t, view, engine };
  });

  if ((result as any).rejected) {
    return { status: (result as any).status, json: (result as any).json };
  }

  return {
    status: 200,
    json: {
      ok: true,
      routeVersion: ROUTE_VERSION,
      engineBuild: ENGINE_BUILD,
      turn: {
        ...(result as any).turn,
        engine: (result as any).engine,
        stateDeltas: Array.isArray((result as any)?.engine?.stateDeltas) ? (result as any).engine.stateDeltas : [],
        ledgerAdds: Array.isArray((result as any)?.engine?.ledgerAdds) ? (result as any).engine.ledgerAdds : [],
      },
      view: (result as any).view,
    },
  };
}
