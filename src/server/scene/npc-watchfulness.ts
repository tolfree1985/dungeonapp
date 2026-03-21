import type { NpcSuspicionStance } from '@/server/scene/npc-suspicion-stance';

export type NpcWatchfulnessLevel = 'normal' | 'elevated' | 'high' | 'hostile';

export function resolveNpcWatchfulness(stance: NpcSuspicionStance): {
  level: NpcWatchfulnessLevel;
  costDelta: number;
} {
  switch (stance) {
    case 'hostile-watch':
      return { level: 'hostile', costDelta: 3 };
    case 'alerted':
      return { level: 'high', costDelta: 2 };
    case 'suspicious':
      return { level: 'elevated', costDelta: 1 };
    default:
      return { level: 'normal', costDelta: 0 };
  }
}
