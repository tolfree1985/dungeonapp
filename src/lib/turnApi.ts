import type { ScenePresentation } from "@/lib/resolveTurnSceneArtPresentation";
import type { SceneContinuityInfo } from "@/lib/sceneContinuityInfo";
import type { SceneTransition } from "@/lib/resolveSceneTransition";
import type { PlayTurn } from "@/app/play/types";
import type { CanonicalSceneArtState } from "@/lib/scene-art/canonicalSceneArtState";

export type TurnInputPayload = {
  playerText: string;
  mode: "DO" | "SAY" | "LOOK";
};

export type TurnApiResponse = {
  turn: PlayTurn;
  turnIndex: number;
  sceneTransition?: SceneTransition | null;
  scenePresentation?: ScenePresentation | null;
  sceneArt?: CanonicalSceneArtState | null;
  sceneContinuity?: SceneContinuityInfo | null;
};
