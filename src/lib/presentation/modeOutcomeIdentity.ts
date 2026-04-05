export type ModeAction = "DO" | "LOOK" | "SAY";

type ModeConfig = {
  rewardKeywords: string[];
  rewardFallback: string;
  costKeywords: string[];
  costFallback: string;
  followUp: string;
};

const MODE_CONFIG: Record<ModeAction, ModeConfig> = {
  LOOK: {
    rewardKeywords: ["clue", "detail", "discover", "hint", "read"],
    rewardFallback: "You uncover a detail the room finally admits.",
    costKeywords: ["time", "pressure", "exposure"],
    costFallback: "The extra search costs you precious time.",
    followUp: "Chase that detail before it fades.",
  },
  DO: {
    rewardKeywords: ["open", "move", "access", "position", "shift", "progress"],
    rewardFallback: "Your action forces progress and opens new space.",
    costKeywords: ["noise", "danger", "exposure", "alert"],
    costFallback: "You trade cover for momentum, inviting new risk.",
    followUp: "Press forward while the momentum holds.",
  },
  SAY: {
    rewardKeywords: ["response", "react", "voice", "signal", "echo"],
    rewardFallback: "Your words draw a reaction, revealing someone nearby.",
    costKeywords: ["attention", "suspicion", "alert", "watch"],
    costFallback: "The room now knows you are here.",
    followUp: "Let their answer guide your next move.",
  },
};

function containsKeyword(line: string, keywords: string[]): boolean {
  const lower = line.toLowerCase();
  return keywords.some((keyword) => lower.includes(keyword));
}

export type ModeOutcomeIdentityResult = {
  consequenceLines: string[];
  followUpHook: string | null;
};

export function applyModeOutcomeIdentity(args: {
  mode: ModeAction | null;
  consequenceLines: string[];
  followUpHook: string | null;
}): ModeOutcomeIdentityResult {
  if (!args.mode) {
    return {
      consequenceLines: args.consequenceLines,
      followUpHook: args.followUpHook,
    };
  }
  const config = MODE_CONFIG[args.mode];
  const lines = [...args.consequenceLines];
  const hasReward = lines.some((line) => containsKeyword(line, config.rewardKeywords));
  if (!hasReward) {
    lines.unshift(config.rewardFallback);
  }
  const hasCost = lines.some((line) => containsKeyword(line, config.costKeywords));
  if (!hasCost) {
    lines.push(config.costFallback);
  }
  return {
    consequenceLines: lines,
    followUpHook: args.followUpHook ?? config.followUp,
  };
}
