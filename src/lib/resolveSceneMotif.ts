import type { SceneShotIntent } from "@/lib/resolveSceneShotIntent";
import type { SceneTransitionMemory } from "@/lib/sceneTypes";
import type { SceneVisualState } from "@/lib/resolveSceneVisualState";

export type SceneMotifTone = "neutral" | "tense" | "ominous" | "mysterious";
export type SceneMotifLighting = "even" | "dim" | "harsh" | "glow";
export type SceneMotifAtmosphere = "clear" | "dusty" | "foggy" | "smoky";

export type SceneMotif = {
  tone: SceneMotifTone;
  lighting: SceneMotifLighting;
  atmosphere: SceneMotifAtmosphere;
};

type ResolveSceneMotifArgs = {
  pressureStage?: string | null;
  visualState: SceneVisualState;
  shotIntent: SceneShotIntent;
  transitionMemory?: SceneTransitionMemory | null;
};

const normalizePressure = (value?: string | null) => (value ?? "calm").toLowerCase();

const toneTagMap: Record<SceneMotifTone, string> = {
  neutral: "neutral tone",
  tense: "tense mood",
  ominous: "ominous presence",
  mysterious: "mysterious aura",
};

const lightingTagMap: Record<SceneMotifLighting, string> = {
  even: "even lighting",
  dim: "dim lighting",
  harsh: "harsh lighting",
  glow: "glowing light",
};

const atmosphereTagMap: Record<SceneMotifAtmosphere, string> = {
  clear: "clear air",
  dusty: "dusty air",
  foggy: "foggy air",
  smoky: "smoky air",
};

export function resolveSceneMotif(args: ResolveSceneMotifArgs): SceneMotif {
  const pressure = normalizePressure(args.pressureStage ?? args.visualState.pressureStage);
  const highPressure = pressure === "danger" || pressure === "crisis";
  const { shotIntent } = args;

  const tone: SceneMotifTone = (() => {
    if (shotIntent === "threaten") return "ominous";
    if (shotIntent === "isolate") return "tense";
    if (shotIntent === "reveal") return "mysterious";
    if (highPressure) return "tense";
    return "neutral";
  })();

  const lighting: SceneMotifLighting = (() => {
    if (shotIntent === "reveal") return "glow";
    if (shotIntent === "threaten") return "harsh";
    if (highPressure) return "dim";
    return "even";
  })();

  const atmosphere: SceneMotifAtmosphere = (() => {
    if (shotIntent === "reveal") return "foggy";
    if (shotIntent === "threaten") return "smoky";
    if (highPressure) return "smoky";
    if (shotIntent === "inspect") return "dusty";
    return "clear";
  })();

  return { tone, lighting, atmosphere };
}

export function buildMotifTags(motif: SceneMotif | null): string[] {
  if (!motif) return [];
  return [toneTagMap[motif.tone], lightingTagMap[motif.lighting], atmosphereTagMap[motif.atmosphere]];
}
