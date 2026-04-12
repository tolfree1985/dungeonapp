import type { IntentMode, CanonicalVerb } from "./actionIntent";

export type AffordanceResolverKind =
  | "door"
  | "container"
  | "room"
  | "object";

export type SceneAffordance = {
  id: string;
  label: string;
  aliases: string[];
  resolver: AffordanceResolverKind;
  verbs: CanonicalVerb[];
  requiredFlags?: string[];
  blockedFlags?: string[];
};

export function getSceneAffordances(_mode: IntentMode): SceneAffordance[] {
  return [
    {
      id: "ledger_room_door",
      label: "ledger room door",
      aliases: ["door", "ledger room door"],
      resolver: "door",
      verbs: ["force", "open", "kick", "inspect"],
      blockedFlags: [],
    },
    {
      id: "hall_drawer",
      label: "drawer",
      aliases: ["drawer"],
      resolver: "container",
      verbs: ["pull", "open", "search", "inspect"],
    },
    {
      id: "crate",
      label: "crate",
      aliases: ["crate", "opened crate"],
      resolver: "container",
      verbs: ["inspect", "search", "move", "force"],
    },
    {
      id: "desk",
      label: "desk",
      aliases: ["desk"],
      resolver: "container",
      verbs: ["search", "inspect"],
    },
    {
      id: "room",
      label: "room",
      aliases: ["room", "hall"],
      resolver: "room",
      verbs: ["search", "inspect", "listen", "sneak", "hide"],
    },
    {
      id: "general_container",
      label: "container",
      aliases: ["container", "box"],
      resolver: "container",
      verbs: ["search"],
    },
    {
      id: "generic_object",
      label: "object",
      aliases: ["object", "artifact"],
      resolver: "container",
      verbs: ["search"],
    },
    {
      id: "room_fixture",
      label: "fixture",
      aliases: ["fixture", "pillar", "gauge"],
      resolver: "container",
      verbs: ["search"],
    },
    {
      id: "cabinet",
      label: "cabinet",
      aliases: ["cabinet"],
      resolver: "container",
      verbs: ["tip", "inspect", "search"],
    },
  ];
}
