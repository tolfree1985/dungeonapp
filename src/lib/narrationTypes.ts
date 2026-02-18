// src/lib/narrationTypes.ts

export type NarrationInput = {
  style: {
    genre: "mystery-adventure";
    tone: "grounded, serious";
    pov: "second-person";
    tense: "present";
    allowedMagicLevel: "low-or-unclear";
    profanity: "none";
    maxWords: number; // e.g. 220
  };

  // Canonical truth: state is source of truth
  state: unknown; // Adventure.state AFTER applying deltas
  stateBefore?: unknown; // optional: helps narrator describe change safely
  playerInput: string;

  // Computed by engine (narrator must not change this)
  resolution: {
    roll: { d1: number; d2: number; total: number };
    tier: "success" | "mixed" | "fail";
    costs?: string[];
  };

  // Only allowed "facts of change"
  stateDeltas: Array<{
    path: string;
    op: "set" | "inc" | "push" | "merge" | "del";
    value?: unknown;
  }>;

  causalLedgerAdds: Array<{
    id: string;
    atTurn: number;
    type: "cause_effect";
    cause: string;
    effect: string;
    severity: "minor" | "major";
    tags?: string[];
  }>;

  lastTurn?: { narration?: string; sceneTitle?: string };
  scene: { location?: string; timeOfDay?: string; situation?: string };
};

export type NarrationOutput = {
  scene: string;
  resolution: {
    rollText: string;    // must reflect provided roll+tier
    outcomeText: string; // short fictional meaning of the tier
  };
  narration: string;

  stateChanges: Array<{
    path: string;
    summary: string;
  }>;

  causalLedger: Array<{
    id: string;
    summary: string;
  }>;

  options: Array<string>; // 3–5
};
