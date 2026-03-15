import type { SceneTransition } from "@/lib/resolveSceneTransition";
import type { SceneRefreshDecision } from "@/lib/resolveSceneRefreshDecision";

export type SceneContinuityState = {
  shouldReuseImage: boolean;
  shouldShowCaption: boolean;
  shouldRequestRefresh: boolean;
};

export function resolveSceneContinuityState(args: {
  refreshDecision: SceneRefreshDecision | null;
  transition: SceneTransition | null;
  currentImageUrl: string | null;
  previousImageUrl: string | null;
  isPending: boolean;
}): SceneContinuityState {
  const { transition, currentImageUrl, previousImageUrl, isPending } = args;
  if (!args.refreshDecision) {
    const type = transition?.type ?? "cut";
    switch (type) {
      case "hold":
        return {
          shouldReuseImage: true,
          shouldShowCaption: Boolean(currentImageUrl && currentImageUrl !== previousImageUrl),
          shouldRequestRefresh: false,
        };
      case "advance":
        return {
          shouldReuseImage: true,
          shouldShowCaption: true,
          shouldRequestRefresh: isPending,
        };
      case "cut":
      default:
        return {
          shouldReuseImage: false,
          shouldShowCaption: true,
          shouldRequestRefresh: true,
        };
    }
  }

  return {
    shouldReuseImage: args.refreshDecision.shouldReuseCurrentImage,
    shouldShowCaption:
      args.refreshDecision.shouldSwapImmediatelyWhenReady ||
      Boolean(currentImageUrl && previousImageUrl && currentImageUrl !== previousImageUrl),
    shouldRequestRefresh:
      args.refreshDecision.shouldQueueRender &&
      (args.refreshDecision.shouldSwapImmediatelyWhenReady || isPending),
  };
}
