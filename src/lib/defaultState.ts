export function makeDefaultState(adventureId: string) {
  return {
    meta: {
      adventureId,
      time: { tick: 0, label: "Night 1" },
    },
    player: {
      stats: { grit: 1, wits: 1, charm: 0, finesse: 0 },
      conditions: [],
      inventory: [],
      money: 0,
    },
    world: {
      locationId: "loc_start",
      flags: {},
      clocks: [
        { id: "clk_noise", label: "Noise", current: 0, max: 6 },
        { id: "clk_suspicion", label: "Suspicion", current: 0, max: 6 },
      ],
    },

    // ✅ Sprint 2: Story Cards (anti-drift memory)
    memory: {
      tags: ["mystery", "tone:grounded", "start"],
      cards: [
        {
          id: "card_rule_state_is_truth",
          title: "State is the source of truth",
          kind: "rule",
          text: "The world follows concrete state changes. No retcons; consequences persist.",
          tags: ["rule", "consistency"],
          triggers: { any: ["always"] },
          priority: 100,
        },
        {
          id: "card_loc_cellar_door",
          title: "The cellar door",
          kind: "location",
          text: "A heavy cellar door with flaking paint. It sticks slightly before giving way.",
          tags: ["cellar", "door", "location"],
          triggers: { any: ["cellar", "door"] },
          priority: 40,
        },
        {
          id: "card_clock_noise",
          title: "Noise attracts attention",
          kind: "rule",
          text: "Rising noise increases the chance of interruption, pursuit, or discovery.",
          tags: ["clk_noise", "noise", "rule", "pressure"],
          triggers: { any: ["noise", "clk_noise", "loud"] },
          priority: 60,
        },
      ],
    },

    lastTurn: {
      turnIndex: 0,
      summary: "",
    },
  };
}
