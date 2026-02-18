// src/lib/narratorStub.ts
import type { NarrationInput, NarrationOutput } from "./narrationTypes";

function tierOutcomeText(tier: NarrationInput["resolution"]["tier"]) {
  switch (tier) {
    case "success":
      return "You pull it off cleanly.";
    case "mixed":
      return "You manage it, but there’s a cost.";
    case "fail":
    default:
      return "It doesn’t go your way—something changes, and the story moves on.";
  }
}

export function narratorStub(input: NarrationInput): NarrationOutput {
  const { d1, d2, total } = input.resolution.roll;

  const rollText = `Roll 2d6: ${d1}+${d2} = ${total} → ${input.resolution.tier.toUpperCase()}`;
  const outcomeText = tierOutcomeText(input.resolution.tier);

  const scene =
    input.scene?.situation?.trim() ||
    "You act, and the world reacts—small details snapping into place around you.";

  const stateChanges = input.stateDeltas.map((d) => ({
    path: d.path,
    summary:
      d.op === "set"
        ? `SET ${d.path} = ${JSON.stringify(d.value)}`
        : d.op === "inc"
        ? `INC ${d.path} by ${JSON.stringify(d.value ?? 1)}`
        : d.op === "push"
        ? `PUSH to ${d.path}: ${JSON.stringify(d.value)}`
        : d.op === "merge"
        ? `MERGE into ${d.path}: ${JSON.stringify(d.value)}`
        : `DEL ${d.path}`,
  }));

  const causalLedger = input.causalLedgerAdds.map((e) => ({
    id: e.id,
    summary: `${e.cause} → ${e.effect}`,
  }));

  // Minimal, always-valid options (we’ll make these state-aware later)
  const options = [
    "Follow up on the most suspicious detail.",
    "Change approach and probe from a different angle.",
    "Lay low and observe what happens next.",
  ];

  const narration = [
    scene,
    outcomeText,
    "The consequences settle into the situation, leaving you with a clear next move.",
  ].join(" ");

  return {
    scene,
    resolution: { rollText, outcomeText },
    narration,
    stateChanges,
    causalLedger,
    options,
  };
}
