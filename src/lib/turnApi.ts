import type { ScenePresentation } from "@/lib/resolveTurnSceneArtPresentation";
import type { SceneContinuityInfo } from "@/lib/sceneContinuityInfo";
import type { SceneTransition } from "@/lib/resolveSceneTransition";
import type { PlayTurn } from "@/app/play/types";
import type { CanonicalSceneArtState } from "@/lib/scene-art/canonicalSceneArtState";
import type { SceneRenderOpportunity } from "@/lib/scene-art/renderOpportunity";

export type TurnInputPayload = {
  playerText: string;
  mode: "DO" | "SAY" | "LOOK";
};

export type TurnApiResponse = {
  turn: PlayTurn;
  turnIndex: number;
  sceneTransition?: SceneTransition | null;
  scenePresentation?: ScenePresentation | null;
  sceneArt: CanonicalSceneArtState;
  sceneContinuity?: SceneContinuityInfo | null;
  sceneRenderOpportunity?: SceneRenderOpportunity | null;
  sceneRenderCredits?: number | null;
};

export async function parseTurnApiResponse(response: Response) {
  let data: unknown;
  try {
    data = await response.json();
  } catch (error) {
    data = null;
  }
  console.log("turnApi.raw_json", data);
  console.log(
    "turnApi.raw_json.keys",
    Object.keys((data as Record<string, unknown>) ?? {})
  );
  console.log("turnApi.raw_json.sceneArt", (data as any)?.sceneArt);
  console.log("turnApi.raw_json.resultSceneArt", (data as any)?.resultSceneArt);
  console.log("turnApi.raw_json.data", (data as any)?.data);
  console.log("turnApi.raw_json.turn", (data as any)?.turn);
  return data as TurnApiResponse | { error?: string } | null;
}
