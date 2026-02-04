import { NextResponse } from "next/server";

// Force dynamic so dev never serves cached 404s
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "DungeonPP",
    time: new Date().toISOString(),
  });
}
