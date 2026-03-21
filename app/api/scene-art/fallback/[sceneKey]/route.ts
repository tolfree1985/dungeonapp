import { NextResponse } from "next/server";

const STATIC_FALLBACKS: Record<string, string> = {
  dock_office: "/default-scene.svg",
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ sceneKey: string }> }
) {
  const { sceneKey } = await context.params;
  const imageUrl = STATIC_FALLBACKS[sceneKey] ?? "/default-scene.svg";
  const url = new URL(imageUrl, process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3001");
  return NextResponse.redirect(url);
}
