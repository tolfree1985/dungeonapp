const URL = "http://127.0.0.1:3001/api/turn";
const ADVENTURE_ID = "adv_123";

const ACTION_GROUPS = {
  observe: [
    "look around",
    "scan the room",
    "inspect the surroundings",
    "study the environment",
    "examine the room carefully",
  ],

  search: [
    "search the desk",
    "check the floor",
    "inspect the walls",
    "look behind the furniture",
    "examine the stonework",
  ],

  investigate: [
    "inspect the door",
    "check the window",
    "examine the strange mark",
    "look closer at the object",
    "study the mechanism",
  ],

  movement: [
    "move closer",
    "step back",
    "circle the room",
    "approach the doorway",
  ],
};

function weightedAction(turn) {
  if (turn < 20) return "observe";
  if (turn < 60) return Math.random() < 0.5 ? "search" : "observe";
  if (turn < 120) return "investigate";
  return "movement";
}

function pickAction(turn) {
  const group = weightedAction(turn);
  const actions = ACTION_GROUPS[group];
  return actions[Math.floor(Math.random() * actions.length)];
}

async function runSimulation(turns = 200) {
  console.log(`Running ${turns} simulated turns...\n`);

  for (let i = 0; i < turns; i++) {
    const action = pickAction(i);
    const payload = {
      adventureId: ADVENTURE_ID,
      mode: "LOOK",
      playerText: action,
      action: null,
      tags: [],
      rollTotal: null,
    };

    const response = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const bodyText = await response.text().catch(() => "");
      console.error(`Turn ${i} failed: ${response.status} ${bodyText}`);
    }

    if (i % 25 === 0) {
      console.log(`Turn ${i}`);
    }
  }

  console.log("\nSimulation complete.");
}

runSimulation(200);
