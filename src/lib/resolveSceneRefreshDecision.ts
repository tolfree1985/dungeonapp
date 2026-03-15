import type { SceneTransitionMemory } from "./sceneTypes";

export type SceneRefreshDecision = {
  shouldQueueRender: boolean;
  shouldReuseCurrentImage: boolean;
  shouldSwapImmediatelyWhenReady: boolean;
};

export type ResolveSceneRefreshDecisionArgs = {
  transitionType: "hold" | "advance" | "cut" | null;
  currentSceneKey: string | null;
  previousSceneKey: string | null;
  currentReady: boolean;
  previousReady: boolean;
  transitionMemory?: SceneTransitionMemory | null;
};

export function resolveSceneRefreshDecision(
  args: ResolveSceneRefreshDecisionArgs,
): SceneRefreshDecision {
  const type = args.transitionType ?? "cut";
  const keysDiffer = args.currentSceneKey !== args.previousSceneKey;
  const memory = args.transitionMemory ?? null;
  const fullyPreserved =
    memory &&
    memory.preserveFraming &&
    memory.preserveSubject &&
    memory.preserveActor &&
    memory.preserveFocus;

  if (fullyPreserved) {
    return {
      shouldQueueRender: false,
      shouldReuseCurrentImage: true,
      shouldSwapImmediatelyWhenReady: false,
    };
  }

  switch (type) {
    case "hold":
      return {
        shouldQueueRender: keysDiffer,
        shouldReuseCurrentImage: true,
        shouldSwapImmediatelyWhenReady: false,
      };
    case "advance":
      return {
        shouldQueueRender: keysDiffer,
        shouldReuseCurrentImage: true,
        shouldSwapImmediatelyWhenReady: false,
      };
    case "cut":
    default:
      return {
        shouldQueueRender: keysDiffer,
        shouldReuseCurrentImage: false,
        shouldSwapImmediatelyWhenReady: true,
      };
  }
}
