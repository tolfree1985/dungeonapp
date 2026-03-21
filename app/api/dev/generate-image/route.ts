import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { prompt, sceneKey } = await request.json();
  console.log("SCENE PROMPT", {
    prompt,
  });

  const fallback =
    sceneKey === "dock_office"
      ? "/scene-art/dock_office.jpg"
      : "/scene-art/generated-placeholder.jpg";

  return NextResponse.json({
    imageUrl: fallback,
  });
}
