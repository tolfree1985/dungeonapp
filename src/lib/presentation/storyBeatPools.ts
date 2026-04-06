import type { TurnMode } from "./buildTurnConsequences";

export type StoryBeatOutcome = "SUCCESS" | "SUCCESS_WITH_COST" | "FAIL_FORWARD" | "MISS";

function createPool<T>(entries: readonly T[]): readonly T[] {
  return Object.freeze(entries.slice());
}

export const STORY_OPENERS: Record<TurnMode, readonly string[]> = {
  LOOK: createPool([
    "You crouch beside the loose page and let your attention settle on its torn edge.",
    "You lean forward so slowly the air barely stirs before you study the detail.",
    "You still your breath and study the scene, letting the smallest irregularities speak first.",
  ]),
  DO: createPool([
    "You put your shoulder into the ledger room door and force it the rest of the way open.",
    "You commit before hesitation can claim it, shoving the room into motion.",
    "You act quickly, dragging dust and breath with you as the scene answers.",
  ]),
  SAY: createPool([
    "Your voice cuts across the corridor, daring the silence to answer.",
    "You let your words drift down the hall and wait for something to reply.",
    "You speak into the dark as if demanding the hush show its face.",
  ]),
};

export const STORY_CLUE_DETAILS: Record<TurnMode, readonly string[]> = {
  LOOK: createPool([
    "Beneath the page, the dust is dragged in a deliberate trail toward the shelving.",
    "A scrape along the stone glows faintly with fresh oil, unequal to the rest of the floor.",
    "One margin of the ledger still holds a legible entry, the rest scratched away in haste.",
  ]),
  DO: createPool([
    "The warped wood gives with a dry crack, and ragged shelves appear in the doorway.",
    "A chair lies toppled, its legs pointing toward the hallway as if someone fled through the gap.",
    "The room opens in crooked planes; ash and clothing lie tossed as if the room were still moving.",
  ]),
  SAY: createPool([
    "Something distant answers with the faint settling of a heavy footstep.",
    "Air shifts down the corridor, carrying a distant thunk from behind the shelves.",
    "A small knock replies from the dark, brittle as old wood under pressure.",
  ]),
};

export const STORY_REACTIONS: Record<TurnMode, readonly string[]> = {
  LOOK: createPool([
    "The room stays silent but not empty; dark wood hums with a faint settling creak.",
    "The shadows hold still, but their edges grow sharp as if taking notice of you.",
    "Air trembles inside the hall, as though the house itself is watching how you move.",
  ]),
  DO: createPool([
    "The sound carries much farther than you planned, filling the servants' wing with cracked wood and dust.",
    "Loose debris spills into the corridor, marking the moment you disturbed the hush.",
    "The stretch of floor in front of you vibrates as if the room resists the change.",
  ]),
  SAY: createPool([
    "Silence stiffens, and then a small scrap of movement answers from deeper in the dark.",
    "The hush shifts, trading calm for a tense pause that feels like someone checking the hall.",
    "The heavy air vibrates with the echo of your own words before it settles again.",
  ]),
};

export const STORY_THREATS: Record<StoryBeatOutcome | "default", readonly string[]> = {
  SUCCESS: createPool([
    "The moment holds, but the unease in the air makes you feel watched.",
    "Pressure hangs in the room like a held breath, waiting for you to lean harder.",
    "The silence tightens around you, as if sensing the next step you’ll take.",
  ]),
  SUCCESS_WITH_COST: createPool([
    "You see the cost already: the room knows you were here, and the risk rises.",
    "Momentum carries a price; nearby walls whisper that someone may be tracing the sound.",
    "Danger settles in the corners, ready to snap as soon as you hesitate.",
  ]),
  FAIL_FORWARD: createPool([
    "Something answers the mistake with a distant shift, making it clear the room is awake now.",
    "An unsettled creak replies, and you can almost sense the figure that heard you move.",
    "The hush no longer obeys you; it leans toward the sound, hungry for a follow-up.",
  ]),
  MISS: createPool([
    "The silence draws a tighter circle, daring you to try again before it breaks the spell.",
    "You feel the walls close around you, like a trap resetting itself.",
    "The air chills with warning; whatever watches does not intend to stay still much longer.",
  ]),
  default: createPool([
    "The danger waits like a thickening fog; every second now matters.",
    "You feel the pressure climb, unfinished but very present.",
    "The room may still be quiet, but the tension tells you it will never quite return to calm.",
  ]),
};
