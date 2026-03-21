import { describe, expect, it } from "vitest";
import { choosePlayableAdventure, resolveOpeningSceneText } from "@/app/play/page";

const makePlayableAdventure = () => ({
  state: {
    currentScene: {
      key: "dock_office",
      text: "You arrive at dawn in the dock office.",
    },
    _meta: {
      scenarioId: "test-scenario",
    },
  },
  turns: [
    {
      scene: "You arrive at dawn in the dock office.",
    },
  ],
});

const makePoisonedAdventure = () => ({
  state: null,
  turns: [],
});

describe("play bootstrap guard", () => {
  it("skips poisoned adventures and renders opening scene from state.currentScene", () => {
    const poisoned = makePoisonedAdventure();
    const playable = makePlayableAdventure();

    const selected = choosePlayableAdventure({
      requested: poisoned,
      latest: playable,
    });

    expect(selected).toBe(playable);

    const sceneText = resolveOpeningSceneText({
      latestTurnScene: null,
      stateCurrentSceneText: (playable.state as any).currentScene.text,
      fallbackTurnScene: null,
    });

    expect(sceneText).toBe("You arrive at dawn in the dock office.");
  });
});
