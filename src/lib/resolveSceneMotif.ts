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
