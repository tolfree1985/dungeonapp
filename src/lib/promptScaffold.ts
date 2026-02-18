// src/lib/promptScaffold.ts
import type { NarrationInput } from "./narrationTypes";
import type { MemoryBundle } from "./storyCards";

export type PromptParts = {
  system: string;
  developer: string;
  user: string;
  preview: string;
  meta: {
    maxWords: number;
    style: NarrationInput["style"];
  };
};

function json(v: unknown) {
  return JSON.stringify(v, null, 2);
}

function normalize(s: string) {
  return (s ?? "").toString().trim();
}

// ✅ Cost/drift control: only send what the narrator needs
function buildStateSnapshot(state: any) {
  const clocks = Array.isArray(state?.world?.clocks) ? state.world.clocks : [];
  const snapshotClocks = clocks.map((c: any) => ({
    id: c?.id,
    label: c?.label,
    current: c?.current,
    max: c?.max,
  }));

  return {
    meta: {
      time: state?.meta?.time ?? null,
    },
    world: {
      locationId: state?.world?.locationId ?? null,
      clocks: snapshotClocks,
    },
    player: {
      stats: state?.player?.stats ?? null,
      conditions: state?.player?.conditions ?? [],
      inventory: state?.player?.inventory ?? [],
      money: state?.player?.money ?? 0,
    },
    memory: {
      tags: Array.isArray(state?.memory?.tags) ? state.memory.tags : [],
    },
  };
}

function formatTags(tags: unknown): string {
  if (!Array.isArray(tags)) return "";
  const t = tags.map(String).filter(Boolean);
  return t.length ? ` (tags: ${t.join(", ")})` : "";
}

function formatStoryCardRecap(memory: MemoryBundle): string {
  if (!memory?.injected?.length) return "(none)";
  return memory.injected
    .map((c) => `- [${c.kind}] ${c.title} — ${c.text}${formatTags(c.tags)}`)
    .join("\n");
}

function formatGateLine(memory: MemoryBundle): string {
  const g: any = (memory as any)?.gate;
  if (!g) return "(none)";
  const sev = g.severity ? String(g.severity).toUpperCase() : "UNKNOWN";
  return `${sev}: ${g.reason} Forced option: "${g.forcedOption}"`;
}

function formatDeltaRecap(deltas: any[], max = 5): string {
  if (!Array.isArray(deltas) || deltas.length === 0) return "(none)";
  return deltas
    .slice(0, max)
    .map((d) => {
      const op = String(d?.op ?? "?").toUpperCase();
      const path = normalize(d?.path ?? "");
      const val = d?.value !== undefined ? ` ${normalize(JSON.stringify(d.value))}` : "";
      return `- ${op} ${path}${val}`.trim();
    })
    .join("\n");
}

function formatLedgerRecap(ledger: any[], max = 3): string {
  if (!Array.isArray(ledger) || ledger.length === 0) return "(none)";
  return ledger
    .slice(0, max)
    .map((e) => {
      const cause = normalize(e?.cause ?? "");
      const effect = normalize(e?.effect ?? "");
      if (cause && effect) return `- ${cause} → ${effect}`;
      const summary = normalize(e?.summary ?? "");
      if (summary) return `- ${summary}`;
      return `- ${normalize(JSON.stringify(e))}`;
    })
    .join("\n");
}

export function buildPromptParts(args: {
  narrationInput: NarrationInput;
  memory: MemoryBundle;
}): PromptParts {
  const { narrationInput, memory } = args;

  const system = [
    "You are the GM Narrator for a state-driven mystery-adventure RPG.",
    "",
    "Non-negotiables:",
    "- State is the source of truth. Never introduce facts not implied by provided deltas, ledger, or injected memory cards.",
    "- You do not decide outcomes. Resolution is already computed.",
    "- Be consistent with established facts. No retcons.",
    "- Be transparent: echo the roll and tier exactly as provided.",
    "- Fail-forward: even failure creates new situation and options (already reflected in deltas/ledger/gates).",
    "",
    "Output must be valid JSON matching NarrationOutput. No markdown. No extra keys.",
  ].join("\n");

  const developer = [
    `Style locks:`,
    `- Genre: ${narrationInput.style.genre}`,
    `- Tone: ${narrationInput.style.tone}`,
    `- POV: ${narrationInput.style.pov}`,
    `- Tense: ${narrationInput.style.tense}`,
    `- Max words: ${narrationInput.style.maxWords}`,
    "",
    "Memory rules:",
    "- Treat injected Story Cards as canon.",
    "- If a gate is present, the situation MUST reflect that pressure.",
    "- Options must include the forced option when a gate exists.",
    "",
    "Important:",
    "- You are given a STATE SNAPSHOT (not full state). Do not infer missing details.",
    "- You are given compact recaps for deltas/ledger. Do not invent extra changes.",
  ].join("\n");

  const user = [
    "=== STORY CARD RECAP (canon) ===",
    formatStoryCardRecap(memory),
    "",
    "=== MEMORY GATE (if any) ===",
    formatGateLine(memory),
    "",
    "=== STATE SNAPSHOT (compact) ===",
    json(buildStateSnapshot(narrationInput.state)),
    "",
    "=== RESOLUTION (already computed) ===",
    json(narrationInput.resolution),
    "",
    "=== STATE DELTAS (recap) ===",
    formatDeltaRecap(narrationInput.stateDeltas, 5),
    "",
    "=== CAUSAL LEDGER ADDS (recap) ===",
    formatLedgerRecap(narrationInput.causalLedgerAdds as any, 3),
    "",
    "=== PLAYER INPUT ===",
    narrationInput.playerInput,
  ].join("\n");

  const full = `${system}\n\n${developer}\n\n${user}`;
  const preview = full.slice(0, 400);

  return {
    system,
    developer,
    user,
    preview,
    meta: { maxWords: narrationInput.style.maxWords, style: narrationInput.style },
  };
}
