import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { loadState, saveState } from "@/lib/stateStore"
import { createInitialState } from "@/lib/state"

/**
 * Sprint 1.5 — State-only Turn Resolution
 * No dice. Deterministic world continuity + threat clock.
 */

/* ---------------- Continuity + Threat ---------------- */

function continuityHash(state: any) {
  // NOTE: string proof for Sprint 1.5 (not cryptographic yet)
  return JSON.stringify({
    turn: state?.meta?.turn ?? 0,
    timeMinutes: state?.world?.timeMinutes ?? 0,
    threat: state?.world?.threat ?? 0,
    flags: state?.world?.flags ?? {},
  })
}

type ThreatBand = "safe" | "suspicious" | "alert" | "hostile" | "overrun"

function threatBand(threat: number): ThreatBand {
  const t = Math.max(0, Math.floor(threat || 0))
  if (t <= 1) return "safe"
  if (t <= 3) return "suspicious"
  if (t <= 5) return "alert"
  if (t <= 7) return "hostile"
  return "overrun"
}

/* ---------------- State Validation ---------------- */

function validateAndNormalizeState(state: any) {
  const issues: Array<{ path: string; message: string; fix?: string }> = []

  state.meta ??= { turn: 0 }
  state.world ??= { threat: 0, timeMinutes: 0, flags: {} }
  state.world.flags ??= {}
  state.pc ??= { hp: 10 }

  if (typeof state.meta.turn !== "number" || state.meta.turn < 0) {
    issues.push({ path: "meta.turn", message: "must be non-negative number", fix: "set to 0" })
    state.meta.turn = 0
  }

  if (typeof state.world.timeMinutes !== "number" || state.world.timeMinutes < 0) {
    issues.push({ path: "world.timeMinutes", message: "must be non-negative number", fix: "set to 0" })
    state.world.timeMinutes = 0
  }

  if (typeof state.world.threat !== "number" || Number.isNaN(state.world.threat)) {
    issues.push({ path: "world.threat", message: "must be number", fix: "set to 0" })
    state.world.threat = 0
  }

  state.world.threat = Math.max(0, Math.floor(state.world.threat))

  for (const key of ["alarmRaised", "doorBroken", "doorUnlocked"] as const) {
    if (typeof state.world.flags[key] !== "boolean") {
      issues.push({ path: `world.flags.${key}`, message: "must be boolean", fix: "set to false" })
      state.world.flags[key] = false
    }
  }

  return { state, issues }
}

/* ---------------- Input Classification ---------------- */

function classifyInput(input: string): "quiet" | "loud" | "other" {
  const t = input.toLowerCase()
  if (/(kick|smash|break|bash|slam|shoulder)/.test(t)) return "loud"
  if (/(quiet|sneak|listen|careful|pick|whisper)/.test(t)) return "quiet"
  return "other"
}

/* ---------------- Scene Selection ---------------- */

function pickScene(state: any): string {
  const threat = state.world.threat
  const flags = state.world.flags

  if (flags.alarmRaised || threat >= 6) {
    return "Lantern light sweeps the corridor. Voices echo nearby — the alarm is raised."
  }
  if (threat >= 3) {
    return "Bootsteps approach in the distance. Someone is searching."
  }
  if (flags.doorBroken) {
    return "The door frame is splintered. The noise still feels recent."
  }
  if (flags.doorUnlocked) {
    return "The lock yields silently. The passage ahead lies open."
  }
  return "A quiet corridor stretches ahead. Dust hangs in the still air."
}

/* ==================== API ROUTE ==================== */

export async function POST(req: NextRequest) {
  let body: any = {}
  try {
    body = await req.json()
  } catch {}

  const playerInput =
    typeof body?.playerInput === "string"
      ? body.playerInput
      : typeof body?.input === "string"
      ? body.input
      : ""

  if (!playerInput.trim()) {
    return NextResponse.json(
      { error: "Missing player input. Send { input } or { playerInput }." },
      { status: 400 }
    )
  }

  // Stable session
  const cookieSid = req.cookies.get("dpp_sid")?.value
  const sessionId = cookieSid || String(body?.sessionId || crypto.randomUUID())

  // Load or create state
  let state = loadState(sessionId) ?? createInitialState()

  const continuityBefore = continuityHash(state)

  const validated = validateAndNormalizeState(state)
  state = validated.state

  // Time always advances
  state.meta.turn += 1
  state.world.timeMinutes += 1

  const tone = classifyInput(playerInput)
  const ledgerUpdates: Array<{ because: string; therefore: string }> = []

  if (tone === "loud") {
    state.world.threat = Math.min(10, state.world.threat + 2)
    state.world.flags.doorBroken = true
    ledgerUpdates.push({
      because: `Player action: "${playerInput}" (loud)`,
      therefore: "Threat increased (+2). Door damaged.",
    })
  } else if (tone === "quiet") {
    state.world.threat = Math.max(0, state.world.threat - 1)
    state.world.flags.doorUnlocked = true
    ledgerUpdates.push({
      because: `Player action: "${playerInput}" (quiet)`,
      therefore: "Threat reduced (-1). Lock opened quietly.",
    })
  } else {
    ledgerUpdates.push({
      because: `Player action: "${playerInput}"`,
      therefore: "No significant noise change.",
    })
  }

  if (state.world.threat >= 6 && !state.world.flags.alarmRaised) {
    state.world.flags.alarmRaised = true
    ledgerUpdates.push({
      because: "Threat reached critical level",
      therefore: "Alarm raised. Patrols mobilized.",
    })
  }

  const band = threatBand(state.world.threat)
  const scene = pickScene(state)

  const options = state.world.flags.alarmRaised
    ? ["Run", "Hide", "Bluff your way out"]
    : state.world.threat >= 3
    ? ["Hide and listen", "Move carefully", "Create a distraction"]
    : ["Listen at the door", "Pick the lock", "Force it open"]

  saveState(sessionId, state)

  const continuityAfter = continuityHash(state)

  const res = NextResponse.json({
    turnResult: {
      scene: `${scene}\n\nYou try: "${playerInput}".`,
      resolution: {
        roll: null,
        mods: [],
        resultBand: "state_only",
      },
      stateDelta: {
        "meta.turn": state.meta.turn,
        "world.timeMinutes": state.world.timeMinutes,
        "world.threat": state.world.threat,
        "world.flags": state.world.flags,
      },
      ledgerUpdates,
      options,
      meta: {
        threatBand: band,
        continuity: {
          before: continuityBefore,
          after: continuityAfter,
        },
        validationIssues: validated.issues,
      },
    },
  })

  if (!cookieSid) {
    res.cookies.set("dpp_sid", sessionId, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
    })
  }

  return res
}
