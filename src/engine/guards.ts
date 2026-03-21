const LOW_REUSE_THRESHOLD = 0.4;
const THROTTLE_THRESHOLD = 0.25;
const sceneHistoryMap = new Map<string, (string | null)[]>();

export type RenderGuardArgs = {
  adventureId: string;
  sceneKey: string | null;
  previousSceneKey?: string | null;
  turnIndex: number | null;
  reuseRate: number;
};

export function checkRenderAnomaly({ reuseRate, turnIndex, sceneKey, adventureId }: RenderGuardArgs) {
  if ((turnIndex ?? 0) > 10 && reuseRate < LOW_REUSE_THRESHOLD) {
    console.warn("scene.render.anomaly", {
      reuseRate,
      turnIndex,
      sceneKey,
      adventureId,
    });
  }
}

export function checkRenderThrottle({ reuseRate, turnIndex, sceneKey, adventureId }: RenderGuardArgs) {
  if ((turnIndex ?? 0) > 10 && reuseRate < THROTTLE_THRESHOLD) {
    console.warn("scene.render.throttle", {
      reuseRate,
      turnIndex,
      sceneKey,
      adventureId,
    });
  }
}

export type IdentityDriftStabilization = {
  correctedSceneKey: string | null;
};

export function checkIdentityDrift({
  adventureId,
  currentSceneKey,
  previousSceneKey,
  turnIndex,
}: {
  adventureId: string;
  currentSceneKey: string | null;
  previousSceneKey: string | null;
  turnIndex: number | null;
}): IdentityDriftStabilization {
  const history = sceneHistoryMap.get(adventureId) ?? [];
  history.push(currentSceneKey);
  if (history.length > 3) {
    history.shift();
  }
  sceneHistoryMap.set(adventureId, history);
  if (history.length === 3) {
    const [first, second, third] = history;
    if (first !== null && first === third && second !== first) {
      console.warn("scene.identity.drift", {
        adventureId,
        turnIndex,
        currentSceneKey,
        previousSceneKey,
        sceneHistory: [...history],
      });
      return { correctedSceneKey: first };
    }
  }
  return { correctedSceneKey: null };
}

export function resetSceneHistory() {
  sceneHistoryMap.clear();
}
