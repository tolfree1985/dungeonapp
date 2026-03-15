import type { SceneVisualState } from "@/lib/resolveSceneVisualState";

export type SceneFrameKind =
  | "wide_environment"
  | "investigation_focus"
  | "threat_focus"
  | "transition_view"
  | "close_detail";

export type SceneFramingState = {
  frameKind: SceneFrameKind;
  shotScale: "wide" | "medium" | "close";
  subjectFocus: "environment" | "clue" | "threat" | "path" | "detail";
  cameraAngle: "level" | "low" | "high";
};

type TurnLike = {
  scene?: string | null;
  playerInput?: string | null;
  intentJson?: unknown;
};

function getIntentMode(turn: TurnLike | null): "DO" | "SAY" | "LOOK" | null {
  const raw = (turn?.intentJson as { mode?: unknown } | null)?.mode;
  return raw === "DO" || raw === "SAY" || raw === "LOOK" ? raw : null;
}

export function resolveSceneFramingState(args: {
  turn: TurnLike | null;
  visual: SceneVisualState;
  locationChanged?: boolean;
}): SceneFramingState {
  const { turn, visual, locationChanged = false } = args;
  const mode = getIntentMode(turn);

  if (locationChanged) {
    return {
      frameKind: "transition_view",
      shotScale: "wide",
      subjectFocus: "path",
      cameraAngle: "level",
    };
  }

  if (visual.threatPresence === "imminent" || visual.threatPresence === "nearby") {
    return {
      frameKind: "threat_focus",
      shotScale: "medium",
      subjectFocus: "threat",
      cameraAngle: "low",
    };
  }

  if (mode === "LOOK") {
    return {
      frameKind: "investigation_focus",
      shotScale: "close",
      subjectFocus: "clue",
      cameraAngle: "level",
    };
  }

  return {
    frameKind: "wide_environment",
    shotScale: "wide",
    subjectFocus: "environment",
    cameraAngle: "level",
  };
}
