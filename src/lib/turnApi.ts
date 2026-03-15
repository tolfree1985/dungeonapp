import type { SceneArtRow } from "@/lib/resolveTurnSceneArtPresentation";
import type { ScenePresentation } from "@/lib/resolveTurnSceneArtPresentation";
import type { SceneTransition } from "@/lib/resolveSceneTransition";
import type { PlayTurn } from "@/app/play/types";

export type TurnInputPayload = {
  playerText: string;
  mode: "DO" | "SAY" | "LOOK";
};

export type TurnApiResponse = {
  turn: PlayTurn;
  turnIndex: number;
  sceneTransition?: SceneTransition | null;
  scenePresentation?: ScenePresentation | null;
  sceneArt?: SceneArtRow | null;
};
