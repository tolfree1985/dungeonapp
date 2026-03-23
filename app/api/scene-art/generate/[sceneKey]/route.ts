import { NextRequest, NextResponse } from "next/server";
import { queueSceneArtGeneration } from "@/lib/scene-art/queueSceneArtGeneration";

function parseQueryParams(request: NextRequest) {
  return {
    sceneText: request.nextUrl.searchParams.get("sceneText") ?? "",
    stylePreset: request.nextUrl.searchParams.get("stylePreset") ?? null,
    engineVersion: request.nextUrl.searchParams.get("engineVersion") ?? null,
    force: request.nextUrl.searchParams.get("force") === "true",
  };
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ sceneKey: string }> },
) {
  const { sceneKey } = await context.params;
  const query = parseQueryParams(request);
  const result = await queueSceneArtGeneration(
    {
      sceneKey,
      sceneText: query.sceneText,
      stylePreset: query.stylePreset,
      renderMode: "full",
    },
    { force: query.force },
  );
  return NextResponse.json(result);
}
