const URL = "http://127.0.0.1:3001/api/turn";

type Location = "hallway" | "room_start" | "courtyard" | "library";
type Actor = "none" | "guard" | "scholar";
type Detail = "none" | "loose-stone" | "burned-ledger" | "blood-trail";
type Objective = "search" | "move" | "hide";

type SimState = {
  location: Location;
  actor: Actor;
  detail: Detail;
  objective: Objective;
  turnsInScene: number;
};

const locationSequence: Location[] = ["hallway", "room_start", "courtyard", "library"];

function getNextLocation(current: Location): Location {
  const idx = locationSequence.indexOf(current);
  return locationSequence[(idx + 1) % locationSequence.length];
}

function actorForLocation(location: Location): Actor {
  if (location === "hallway" || location === "courtyard") return "guard";
  if (location === "library") return "scholar";
  return "none";
}

function detailForLocation(location: Location): Detail {
  if (location === "hallway") return "loose-stone";
  if (location === "room_start") return "blood-trail";
  if (location === "courtyard") return "none";
  return "burned-ledger";
}

function generatePlayerText(state: SimState, turn: number): string {
  const { location, actor, detail, objective } = state;
  switch (objective) {
    case "search":
      if (detail !== "none") {
        return `Turn ${turn}: search the ${detail} in the ${location}`;
      }
      return `Turn ${turn}: search the ${location} for clues`;
    case "hide":
      if (actor !== "none") {
        return `Turn ${turn}: hide in the ${location} and watch the ${actor}`;
      }
      return `Turn ${turn}: stay hidden in the ${location}`;
    case "move":
    default:
      if (actor !== "none") {
        return `Turn ${turn}: move past the ${actor} toward the next chamber`;
      }
      return `Turn ${turn}: move through the ${location} quietly`;
  }
}

function updateState(state: SimState): SimState {
  const nextState = { ...state };
  if (state.objective === "move") {
    const nextLocation = getNextLocation(state.location);
    nextState.location = nextLocation;
    nextState.actor = actorForLocation(nextLocation);
    nextState.detail = detailForLocation(nextLocation);
    nextState.turnsInScene = 0;
    nextState.objective = "search";
    return nextState;
  }

  nextState.turnsInScene += 1;
  if (state.turnsInScene >= 2) {
    nextState.objective = state.objective === "search" ? "hide" : "move";
  }
  return nextState;
}

async function run() {
  const MAX_TURNS = 10;
  let i = 1;
  const state: SimState = {
    location: "hallway",
    actor: "guard",
    detail: "loose-stone",
    objective: "search",
    turnsInScene: 0,
  };

  while (i <= MAX_TURNS) {
    const payload = {
      adventureId: "adv_123",
      mode: "play",
      playerText: generatePlayerText(state, i),
      action: null,
      tags: [],
      rollTotal: null,
    };

    try {
      const res = await fetch(URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      console.log(`Turn ${i} response:`, res.status);
      console.log(text);
    } catch (err) {
      console.error(`Turn ${i} simulator error:`, err);
    }

    if (i >= MAX_TURNS) {
      console.log(`Simulator capped at ${MAX_TURNS} turns; stopping.`);
      break;
    }
    Object.assign(state, updateState(state));
    i += 1;
    await new Promise((r) => setTimeout(r, 1000));
  }
}

run();
