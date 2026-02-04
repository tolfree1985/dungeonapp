import { NextResponse } from "next/server";

function roll2d6() {
  const d1 = Math.floor(Math.random() * 6) + 1;
  const d2 = Math.floor(Math.random() * 6) + 1;
  return { d1, d2, total: d1 + d2 };
}

function band(total: number) {
  if (total >= 10) return "success";
  if (total >= 7) return "success_with_cost";
  return "fail_forward";
}

export async function POST(req: Request) {
  const { playerInput } = await req.json();

  const r = roll2d6();
  const resultBand = band(r.total);

  const turnResult = {
    scene:
      resultBand === "success"
        ? `You try: "${playerInput}". It works cleanly.`
        : resultBand === "success_with_cost"
        ? `You try: "${playerInput}". You succeed, but it costs you.`
        : `You try: "${playerInput}". It fails—yet the world shifts (fail-forward).`,
    resolution: {
      roll: { dice: "2d6" as const, d1: r.d1, d2: r.d2, total: r.total },
      mods: [],
      resultBand,
    },
    stateDelta:
      resultBand === "success"
        ? { "world.time": "+5m" }
        : resultBand === "success_with_cost"
        ? { "pc.hp": -1, "world.time": "+10m" }
        : { "world.threat": +1, "world.time": "+10m" },
    ledgerUpdates: [
      {
        because: `Player action: ${playerInput}`,
        therefore:
          resultBand === "success"
            ? "You advance without complication."
            : resultBand === "success_with_cost"
            ? "You advance, but pay a price."
            : "Failure creates a new pressure, not a dead end.",
      },
    ],
    options: ["Press forward", "Pause and observe", "Change tactics"],
  };

  return NextResponse.json({ turnResult });
}
