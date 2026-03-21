export type SceneTimeEffect = "scene.time-shifted" | "scene.window-narrowed";

export function resolveSceneTimeEffect(params: {
  sceneClock: number;
  sameScene: boolean;
  timeAdvanceDelta: number;
}): SceneTimeEffect | null {
  if (!params.sameScene || params.timeAdvanceDelta <= 0) return null;
  if (params.sceneClock >= 3) return "scene.window-narrowed";
  return "scene.time-shifted";
}
