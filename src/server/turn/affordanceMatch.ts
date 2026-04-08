import type { ActionIntent } from "./actionIntent";
import type {
  SceneAffordance,
  AffordanceResolverKind,
} from "./sceneAffordances";

export type AffordanceMatch = {
  affordanceId: string;
  resolver: AffordanceResolverKind;
  label: string;
};

export function matchAffordance(
  intent: ActionIntent,
  affordances: SceneAffordance[],
  stateFlags: Record<string, boolean>,
): AffordanceMatch | null {
  const candidates = affordances.filter((affordance) => {
    if (!affordance.verbs.includes(intent.verb)) return false;
    if (affordance.requiredFlags?.some((flag) => !stateFlags[flag])) return false;
    if (affordance.blockedFlags?.some((flag) => stateFlags[flag])) return false;
    if (!intent.targetText) return false;

    return affordance.aliases.some((alias) =>
      intent.targetText?.includes(alias),
    );
  });

  if (candidates.length === 0) return null;

  const match = candidates[0];

  return {
    affordanceId: match.id,
    resolver: match.resolver,
    label: match.label,
  };
}
