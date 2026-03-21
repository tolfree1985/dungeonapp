import { describe, expect, it } from "vitest";
import { buildSceneShotKey } from "./sceneShot";
import { buildCanonicalSceneArtPayload } from "./canonicalSceneArtPayload";
import type { PlayTurn } from "@/app/play/types";

function makeTurn(id: string, scene: string): PlayTurn {
  return {
    id,
    turnIndex: 1,
    playerInput: "Inspect",
    scene,
    resolution: "ok",
    stateDeltas: [],
    ledgerAdds: [],
    createdAt: new Date().toISOString(),
  };
}

describe("buildCanonicalSceneArtPayload", () => {
  it("keeps the same sceneKey when only the prose or time tick changes", () => {
    const baseState = {
      location: "room_start",
      pressureStage: "crisis",
      stats: {
        heat: 10,
        noise: 0,
        alert: 0,
        pressureStage: "crisis",
        time: 31,
      },
    } as const;

    const turnA = makeTurn("first", "You find the loose edge that matters...");
    const turnB = makeTurn("second", "You search without finding the clean answer...");

    const stateA = { ...baseState, stats: { ...baseState.stats, time: 31 } };
    const stateB = { ...baseState, stats: { ...baseState.stats, time: 33 } };

    const resultA = buildCanonicalSceneArtPayload({ turn: turnA, state: stateA });
    const resultB = buildCanonicalSceneArtPayload({ turn: turnB, state: stateB });

    expect(resultA).not.toBeNull();
    expect(resultB).not.toBeNull();
    expect(resultA?.sceneKey).toBe(resultB?.sceneKey);
    const shotKeyA = buildSceneShotKey({
      frameKind: resultA!.identity.frameKind,
      shotScale: resultA!.identity.shotScale,
      cameraAngle: resultA!.identity.cameraAngle,
      subjectFocus: resultA!.identity.subjectFocus,
      primarySubjectId: resultA!.identity.primarySubjectId,
    });
    const shotKeyB = buildSceneShotKey({
      frameKind: resultB!.identity.frameKind,
      shotScale: resultB!.identity.shotScale,
      cameraAngle: resultB!.identity.cameraAngle,
      subjectFocus: resultB!.identity.subjectFocus,
      primarySubjectId: resultB!.identity.primarySubjectId,
    });
    expect(shotKeyA).toBe(shotKeyB);
  });
});
