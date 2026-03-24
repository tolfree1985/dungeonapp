import { NextResponse } from "next/server";
import { runNextQueuedSceneArtGeneration } from "@/lib/scene-art/runNextQueuedSceneArtGeneration";

const HARD_LIMIT = 10;

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const limit = Math.min(HARD_LIMIT, Math.max(1, Number(body.limit) || 1));

  const processed: string[] = [];

  for (let i = 0; i < limit; i += 1) {
    const result = await runNextQueuedSceneArtGeneration();
    if (!result.promptHash) {
      break;
    }
    processed.push(result.promptHash);
  }

  return NextResponse.json({ processedCount: processed.length, processedPromptHashes: processed });
}
