export type EscalationBeat = {
  sceneShift?: string | null;
  threat?: string | null;
  responseCue?: string | null;
  exhaustion?: string | null;
};

type PressureSnapshot = {
  suspicion: number;
  noise: number;
  time: number;
  danger: number;
};

type BuildEscalationBeatInput = {
  sceneKey: string | null;
  turnIndex: number;
  mode: "DO" | "LOOK" | "SAY";
  pressure: PressureSnapshot;
  repeatedInvestigations: number;
};

const HIGH_NOISE = [
  "Sound now carries farther through the wing.",
  "The corridor no longer swallows your noise.",
  "Your disturbance clings to the air instead of fading.",
] as const;

const HIGH_DANGER = [
  "The next mistake here will not stay contained.",
  "This room no longer feels safe to work slowly.",
  "Whatever happened here is still dangerously close.",
] as const;

const SAY_RESPONSES = [
  "Something beyond the room goes still at the sound of your voice.",
  "Your words pull an answer from deeper in the corridor.",
  "The silence tightens, as if someone is listening back.",
] as const;

const DO_SHIFTS = [
  "The room is no longer undisturbed after your movement.",
  "Your action changes what in this space can be ignored.",
  "The physical state of the room shifts under your hands.",
] as const;

const LOOK_EXHAUSTION = [
  "This room has already yielded its cleanest clue.",
  "You have taken the easiest read this space will give you.",
  "Whatever matters next lies beyond the first obvious evidence.",
] as const;

function pickDeterministic<T>(items: readonly T[], seed: string): T {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return items[hash % items.length]!;
}

export function buildEscalationBeat(input: BuildEscalationBeatInput): EscalationBeat {
  const seed = [
    input.sceneKey ?? "none",
    String(input.turnIndex),
    input.mode,
    String(input.pressure.noise),
    String(input.pressure.danger),
    String(input.repeatedInvestigations),
  ].join(":");

  const beat: EscalationBeat = {};

  if (input.pressure.noise >= 40) {
    beat.sceneShift = pickDeterministic(HIGH_NOISE, `${seed}:noise`);
  }

  if (input.pressure.danger >= 35) {
    beat.threat = pickDeterministic(HIGH_DANGER, `${seed}:danger`);
  }

  if (input.mode === "SAY" && (input.pressure.noise >= 30 || input.pressure.suspicion >= 6)) {
    beat.responseCue = pickDeterministic(SAY_RESPONSES, `${seed}:say`);
  }

  if (input.mode === "DO" && input.pressure.noise >= 25) {
    beat.sceneShift ??= pickDeterministic(DO_SHIFTS, `${seed}:do`);
  }

  if (input.mode === "LOOK" && input.repeatedInvestigations >= 2) {
    beat.exhaustion = pickDeterministic(LOOK_EXHAUSTION, `${seed}:look`);
  }

  return beat;
}

export type { PressureSnapshot };
