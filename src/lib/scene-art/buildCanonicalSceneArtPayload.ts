import type { PlayTurn } from "@/app/play/types";
import { SceneArtPayload } from "@/lib/sceneArt";
import { resolveSceneVisualState } from "@/lib/resolveSceneVisualState";
import { resolveSceneFramingState } from "@/lib/resolveSceneFramingState";
import { resolveSceneSubjectState } from "@/lib/resolveSceneSubjectState";
import { resolveSceneActorState } from "@/lib/resolveSceneActorState";
import { resolveSceneFocusState } from "@/lib/resolveSceneFocusState";
import { ScenePromptFraming } from "@/lib/resolveScenePromptFraming";
import type { SceneShotIntent } from "@/lib/sceneTypes";
import type { SceneDirectorDecision } from "@/lib/resolveSceneDirectorDecision";
import type { LedgerEntry } from "@/lib/engine/resolveTurnContract";
import {
  presentMajorSceneTags,
  presentNpcCuesForPrompt,
  presentNpcStateForSceneKey,
  presentSceneArt,
} from "@/lib/presenters/presentSceneArt";

type CanonicalSceneArtParams = {
  turn: PlayTurn | null;
  state: Record<string, unknown> | null;
  shotIntent?: SceneShotIntent;
  scenePromptFraming?: ScenePromptFraming;
  motifTags?: string[];
  threatFramingTags?: string[];
  revealStructureTags?: string[];
  directorDecision?: SceneDirectorDecision | null;
};

type BuildInput = {
  world: {
    location: string;
    time: string;
    atmosphere: string;
  };
  recentLedger: LedgerEntry[];
  state: {
    pressure: Record<string, number>;
  };
  lastOutcome: {
    type: string;
    tags: string[];
  };
};

type PromptResult = {
  basePrompt: string;
  renderPrompt: string;
  stylePreset: "dark_fantasy";
  tags: string[];
};

export function buildCanonicalSceneArtPayload({
  turn,
  state,
  shotIntent,
  scenePromptFraming,
  motifTags,
  threatFramingTags,
  revealStructureTags,
  directorDecision,
}: CanonicalSceneArtParams): SceneArtPayload | null {
  if (!turn?.scene) return null;

  const stateRecord = asRecord(state);
  const visualState = resolveSceneVisualState(stateRecord);
  const framingState = resolveSceneFramingState({
    turn,
    visual: visualState,
    locationChanged: false,
  });
  const subjectState = resolveSceneSubjectState({
    state: stateRecord,
    framing: framingState,
  });
  const actorState = resolveSceneActorState({
    state: stateRecord,
    subject: subjectState,
  });
  const focusState = resolveSceneFocusState({
    state: stateRecord,
    subject: subjectState,
    actor: actorState,
    framing: framingState,
  });

  const visualTags = [
    `lighting:${visualState.lightingState}`,
    `atmosphere:${visualState.atmosphereState}`,
    `wear:${visualState.environmentWear}`,
    `threat:${visualState.threatPresence}`,
  ];

  const sceneArt = presentSceneArt({
    title: turn.scene,
    visualState,
    visualTags,
    framingState,
    subjectState,
    npcState: presentNpcStateForSceneKey(stateRecord),
    npcCues: presentNpcCuesForPrompt(stateRecord),
    majorTags: presentMajorSceneTags(turn, stateRecord),
    actorState,
    focusState,
    shotIntent,
    scenePromptFraming: scenePromptFraming ?? null,
    motifTags,
    threatFramingTags,
    revealStructureTags,
    directorDecision: directorDecision ?? null,
  });

  const promptInput = buildPromptInput({
    state: { pressure: extractPressure(stateRecord) },
    world: extractWorld(stateRecord),
    recentLedger: normalizeLedgerEntries((turn.ledgerAdds ?? []) as unknown[]),
    lastOutcome: deriveLastOutcome(turn),
  });

  return {
    ...sceneArt,
    basePrompt: promptInput.basePrompt,
    renderPrompt: promptInput.renderPrompt,
    stylePreset: promptInput.stylePreset,
    tags: promptInput.tags,
  };
}

function extractWorld(state: Record<string, unknown> | null) {
  const world = asRecord(state?.world);
  const location = asString(world?.location ?? state?.location ?? "Unknown location");
  const time = asString(world?.timeOfDay ?? world?.time ?? state?.time ?? "late night");
  const atmosphere = asString(world?.atmosphere ?? state?.ambience ?? "tense gloom");
  return {
    location,
    time,
    atmosphere,
  };
}

function extractPressure(state: Record<string, unknown> | null) {
  const pressure = asRecord(state?.pressure) ?? {};
  return {
    noise: typeof pressure.noise === "number" ? pressure.noise : 0,
    danger: typeof pressure.danger === "number" ? pressure.danger : 0,
  };
}

function deriveLastOutcome(turn: PlayTurn): BuildInput["lastOutcome"] {
  const type = (turn.resolution ?? "unknown").toString();
  const tags: string[] = [];
  const presentation = turn.presentation;
  if (presentation?.ledgerEntries) {
    for (const entry of presentation.ledgerEntries) {
      if (typeof entry.effect === "string" && entry.effect.length > 0) {
        const normalized = entry.effect.toUpperCase();
        if (normalized.includes("DISRUPTION")) {
          tags.push("VISIBLE_DISRUPTION");
        }
        if (normalized.includes("THREAT")) {
          tags.push("THREAT" );
        }
        if (normalized.includes("BLAZE") || normalized.includes("FIRE")) {
          tags.push("FIRE" );
        }
      }
    }
  }
  return { type, tags: Array.from(new Set(tags)) };
}

function normalizeLedgerEntries(entries: unknown[]): LedgerEntry[] {
  return entries
    .filter((entry): entry is LedgerEntry => typeof entry === "object" && entry !== null && "effect" in entry)
    .map((entry) => entry as LedgerEntry);
}

function buildPromptInput(input: BuildInput): PromptResult {
  const visualMoments = extractVisualMoments(input.recentLedger);
  const environment = buildEnvironment(input.world);
  const tension = buildTension(input.state);
  const action = buildActionFocus(input.lastOutcome);
  const describeSections = [environment, visualMoments, action, tension].filter(Boolean);
  const basePrompt = describeSections.join(", ");
  const renderPrompt = `${basePrompt}, cinematic lighting, dark fantasy, high detail`;
  return {
    basePrompt,
    renderPrompt,
    stylePreset: "dark_fantasy",
    tags: [...input.lastOutcome.tags],
  };
}

function extractVisualMoments(ledger: LedgerEntry[]): string {
  const moments: string[] = [];
  for (const entry of ledger.slice(-5)) {
    const text = entry.effect?.toLowerCase() ?? "";
    if (text.includes("brazier")) {
      moments.push("overturned brazier spilling embers");
    }
    if (text.includes("noise")) {
      moments.push("disturbed environment, subtle motion in shadows");
    }
    if (text.includes("pressure")) {
      moments.push("tense stillness, air heavy with threat");
    }
    if (text.includes("fire")) {
      moments.push("flickering firelight casting moving shadows");
    }
  }
  return moments.join(", ");
}

function buildEnvironment(world: BuildInput["world"]) {
  return `${world.location}, ${world.time}, ${world.atmosphere}`;
}

function buildTension(state: BuildInput["state"]) {
  const { noise, danger } = state.pressure;
  if (danger > 20) return "imminent danger, oppressive atmosphere";
  if (noise > 20) return "heightened alertness, unstable scene";
  return "quiet but tense environment";
}

function buildActionFocus(outcome: BuildInput["lastOutcome"]) {
  if (outcome.tags.includes("VISIBLE_DISRUPTION")) {
    return "recent physical disturbance is the focal point";
  }
  return "subtle environmental storytelling";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return value.toString();
  return "";
}
