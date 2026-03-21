import type { SceneFocusState } from "@/lib/resolveSceneFocusState";
import type { SceneFramingState } from "@/lib/resolveSceneFramingState";
import type { SceneShotIntent, SceneDirectorMemory, SceneCameraMemory } from "@/lib/sceneTypes";
import type { SceneThreatFraming } from "@/lib/resolveSceneThreatFraming";
import type { SceneRevealStructure } from "@/lib/resolveSceneRevealStructure";
import type { SceneSpatialHierarchy } from "@/lib/resolveSceneSpatialHierarchy";
import type { SceneCompositionBias } from "@/lib/resolveSceneCompositionBias";
import type { SceneDeltaKind } from "@/lib/resolveSceneDeltaKind";
import type { SceneTransition } from "@/lib/resolveSceneTransition";

export type SceneDirectorDecision = {
  shotScale: SceneFramingState["shotScale"];
  cameraAngle: "high" | "eye" | "low";
  focusSubject: "environment" | "threat" | "actor" | "object";
  compositionBias: SceneCompositionBias["balance"];
  emphasis: SceneShotIntent;
};

export type ResolveSceneDirectorDecisionArgs = {
  shotIntent: SceneShotIntent;
  threatFraming: SceneThreatFraming | null;
  revealStructure: SceneRevealStructure | null;
  spatialHierarchy: SceneSpatialHierarchy | null;
  compositionBias: SceneCompositionBias | null;
  pressureStage?: string | null;
  focusState: SceneFocusState;
  sceneTransitionType: SceneTransition["type"] | null;
  framingState: SceneFramingState;
  cameraMemory: SceneCameraMemory | null;
  previousDirectorDecision?: SceneDirectorMemory | null;
  sceneDeltaKind?: SceneDeltaKind | null;
};

const CAMERA_ANGLE_MAP: Record<SceneFramingState["cameraAngle"], SceneDirectorDecision["cameraAngle"]> = {
  high: "high",
  level: "eye",
  low: "low",
};

function deriveFocusSubject(args: ResolveSceneDirectorDecisionArgs): SceneDirectorDecision["focusSubject"] {
  if (args.threatFraming?.threatLevel === "dominant") return "threat";
  if (args.focusState.focusType === "threat") return "threat";
  if (args.spatialHierarchy?.primarySubject === "threat") return "threat";
  if (args.focusState.focusType === "actor") return "actor";
  if (args.focusState.focusType === "object" || args.focusState.focusType === "path" || args.focusState.focusType === "detail") {
    return "object";
  }
  return "environment";
}

function deriveShotScale(args: ResolveSceneDirectorDecisionArgs): SceneDirectorDecision["shotScale"] {
  return args.framingState.shotScale ?? args.cameraMemory?.shotScale ?? "medium";
}

function deriveCameraAngle(args: ResolveSceneDirectorDecisionArgs): SceneDirectorDecision["cameraAngle"] {
  const angle = args.framingState.cameraAngle ?? args.cameraMemory?.cameraAngle ?? "level";
  return CAMERA_ANGLE_MAP[angle];
}

function deriveCompositionBias(args: ResolveSceneDirectorDecisionArgs): SceneDirectorDecision["compositionBias"] {
  if (args.compositionBias) return args.compositionBias.balance;
  if (args.framingState.shotScale === "close") return "centered";
  if (args.focusState.focusType === "threat") return "diagonal";
  return "asymmetric";
}

export function resolveSceneDirectorDecision(args: ResolveSceneDirectorDecisionArgs): SceneDirectorDecision {
  const reuseKinds: Set<SceneDeltaKind> = new Set(["none", "text-only", "motif"]);
  if (args.previousDirectorDecision && args.sceneDeltaKind && reuseKinds.has(args.sceneDeltaKind)) {
    return args.previousDirectorDecision;
  }

  return {
    shotScale: deriveShotScale(args),
    cameraAngle: deriveCameraAngle(args),
    focusSubject: deriveFocusSubject(args),
    compositionBias: deriveCompositionBias(args),
    emphasis: args.shotIntent,
  };
}
