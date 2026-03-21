import type { WatchfulnessActionFlags } from "./watchfulness-action-flags";
import type { PositionActionFlags } from "./position-action-flags";
import type { NoiseActionFlags } from "./noise-action-flags";

export type ActionConstraints = {
  stealthDisadvantage: boolean;
  deceptionDisadvantage: boolean;
  mobilityDisadvantage: boolean;
  coverLost: boolean;
  attentionDrawn: boolean;
  searchPressure: boolean;
};

export function combineActionConstraints(params: {
  watchfulness: WatchfulnessActionFlags | null;
  position: PositionActionFlags | null;
  noise: NoiseActionFlags | null;
}): ActionConstraints {
  const watchfulness = params.watchfulness ?? { stealthDisadvantage: false, deceptionDisadvantage: false };
  const position = params.position ?? { mobilityDisadvantage: false, coverLost: false };
  const noise = params.noise ?? { attentionDrawn: false, searchPressure: false };
  return {
    stealthDisadvantage: watchfulness.stealthDisadvantage,
    deceptionDisadvantage: watchfulness.deceptionDisadvantage,
    mobilityDisadvantage: position.mobilityDisadvantage,
    coverLost: position.coverLost,
    attentionDrawn: noise.attentionDrawn,
    searchPressure: noise.searchPressure,
  };
}
