import type { FinalizedConsequenceNarration } from "@/server/scene/finalized-consequence-narration";
import { expect } from "vitest";

export function expectDeterministicNarration(
  a: { consequenceNarration?: FinalizedConsequenceNarration | null },
  b: { consequenceNarration?: FinalizedConsequenceNarration | null }
) {
  expect(a.consequenceNarration).toEqual(b.consequenceNarration);
}
