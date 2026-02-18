// src/lib/narrate.ts
import type { NarrationInput, NarrationOutput } from "./narrationTypes";
import type { PromptParts } from "./promptScaffold";
import { narratorStub } from "./narratorStub";

export type NarratorMode = "stub" | "llm";

function getMode(): NarratorMode {
  const v = (process.env.NARRATOR_MODE ?? "stub").toLowerCase();
  return v === "llm" ? "llm" : "stub";
}

/**
 * Single entrypoint for narration.
 * - stub: deterministic local output
 * - llm: placeholder (for now returns stub), later will call provider using promptParts
 */
export async function narrate(args: {
  input: NarrationInput;
  promptParts: PromptParts;
}): Promise<{ mode: NarratorMode; output: NarrationOutput }> {
  const mode = getMode();

  if (mode === "stub") {
    return { mode, output: narratorStub(args.input) };
  }

  // TODO (later Sprint 2/4): replace with real provider call:
  // const output = await narrateWithProvider(args.promptParts);
  // return { mode, output };

  // Safe fallback for now:
  return { mode, output: narratorStub(args.input) };
}
