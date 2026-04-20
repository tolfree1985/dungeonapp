import { createInitialStateV1 } from "@/lib/game/bootstrap";
import type { AdventureState } from "@/lib/engine/types/state";
import type { FireState } from "@/lib/environment/fireHazard";
import type { OpportunityWindowLifecycleState } from "@/lib/opportunity-window-state";

type ReplayStateOverrides = Partial<AdventureState> & {
  currentScene?: AdventureState["currentScene"];
  opportunityWindow?: OpportunityWindowLifecycleState | null;
  environmentHazards?: { fire?: FireState | null };
};

export function createReplayState(overrides: ReplayStateOverrides = {}): AdventureState {
  return {
    ...(structuredClone(createInitialStateV1()) as unknown as AdventureState),
    flags: {},
    stats: {},
    quests: {},
    inventory: { items: [] },
    worldItems: [],
    relationships: {},
    memory: [],
    currentScene: null,
    _meta: {
      openingPrompt: null,
      locationKey: null,
      timeKey: null,
    },
    pendingReactions: [],
    opportunityWindow: null,
    opportunityCooldowns: {},
    environmentHazards: {
      fire: null,
    },
    ...overrides,
  };
}
