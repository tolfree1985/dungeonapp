export type SceneTransitionMemory = {
  preserveFraming: boolean;
  preserveSubject: boolean;
  preserveActor: boolean;
  preserveFocus: boolean;
};

export const EMPTY_SCENE_TRANSITION_MEMORY: SceneTransitionMemory = {
  preserveFraming: false,
  preserveSubject: false,
  preserveActor: false,
  preserveFocus: false,
};

export type SceneCameraContinuityState = {
  consecutiveAdvances: number;
};

export const INITIAL_SCENE_CAMERA_CONTINUITY: SceneCameraContinuityState = {
  consecutiveAdvances: 0,
};
