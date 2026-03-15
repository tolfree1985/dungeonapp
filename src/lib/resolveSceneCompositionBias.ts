import type { SceneFramingState } from "@/lib/resolveSceneFramingState";
import type { SceneVisualState } from "@/lib/resolveSceneVisualState";
import type { SceneFocusState } from "@/lib/resolveSceneFocusState";

export type SceneCompositionBalance = "centered" | "asymmetric" | "diagonal";
export type SceneCompositionDepth = "shallow" | "layered" | "deep";
export type SceneCompositionDensity = "sparse" | "balanced" | "crowded";

export type SceneCompositionBias = {
  balance: SceneCompositionBalance;
  depth: SceneCompositionDepth;
  density: SceneCompositionDensity;
};

type ResolveSceneCompositionBiasArgs = {
  framingState: SceneFramingState;
  visualState: SceneVisualState;
  focusState: SceneFocusState;
};

export function resolveSceneCompositionBias({ framingState, visualState, focusState }: ResolveSceneCompositionBiasArgs): SceneCompositionBias {
  const balance: SceneCompositionBalance = framingState.shotScale === "close" ? "centered" : framingState.subjectFocus === "threat" ? "diagonal" : "asymmetric";
  const depth: SceneCompositionDepth = visualState.environmentWear === "breaking" || visualState.lightingState === "flickering" ? "deep" : "layered";
  const density: SceneCompositionDensity = focusState.focusType === "detail" ? "sparse" : focusState.focusType === "environment" ? "balanced" : "crowded";
  return { balance, depth, density };
}
