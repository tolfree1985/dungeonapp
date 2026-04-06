export type ConsequenceKind =
  | "partial_clue"
  | "time_cost"
  | "pressure_increase"
  | "position_worsened"
  | "attention_drawn"
  | "scene_disturbed";

type ConsequenceDefinition = {
  kind: ConsequenceKind;
  keywords: string[];
  text: string;
  summary?: string;
  followUp?: string;
};

const CONSEQUENCE_DEFINITIONS: ConsequenceDefinition[] = [
  {
    kind: "partial_clue",
    keywords: ["clue", "partial"],
    text: "You recover only part of the clue, but one detail survives the damage.",
    summary: "partial clue remains in view",
    followUp: "Piece that detail back together for the next lead.",
  },
  {
    kind: "time_cost",
    keywords: ["time", "advanced"],
    text: "The extra search costs you precious time.",
    summary: "time slips away as you search",
    followUp: "Move faster or accept the delay.",
  },
  {
    kind: "pressure_increase",
    keywords: ["pressure", "increased"],
    text: "The room grows riskier the longer you linger.",
    summary: "pressure rises in the room",
    followUp: "Brace for increased scrutiny.",
  },
  {
    kind: "position_worsened",
    keywords: ["position", "worsened"],
    text: "You are more exposed than you were a moment ago.",
    summary: "your cover weakens",
    followUp: "Find better cover quickly.",
  },
  {
    kind: "attention_drawn",
    keywords: ["noise", "attention"],
    text: "Your movement breaks the room’s silence, drawing eyes toward you.",
    summary: "noise draws attention",
    followUp: "Stay quiet until the alert settles.",
  },
  {
    kind: "scene_disturbed",
    keywords: ["disturb", "disturbed", "moved", "changed", "fire", "burn", "flame", "ignite", "smoke", "heat"],
    text: "The room is no longer undisturbed.",
    summary: "the scene has shifted",
    followUp: "Take stock before it morphs again.",
  },
];

export type ConsequenceLanguage = {
  text: string;
  kind?: ConsequenceKind;
  summary?: string;
  followUp?: string;
};

export function enhanceConsequenceLine(line: string): ConsequenceLanguage {
  const cleaned = line.trim();
  if (!cleaned) return { text: "" };
  const lower = cleaned.toLowerCase();
  for (const definition of CONSEQUENCE_DEFINITIONS) {
    if (definition.keywords.every((keyword) => lower.includes(keyword))) {
      return {
        text: definition.text,
        kind: definition.kind,
        summary: definition.summary,
        followUp: definition.followUp,
      };
    }
  }
  return { text: cleaned };
}
