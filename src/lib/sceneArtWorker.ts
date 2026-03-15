import { prisma } from "@/lib/prisma";

type RenderSceneArtResult = {
  imageUrl: string;
};

export type SceneArtRenderer = (input: {
  sceneArtId: string;
  sceneKey: string;
  renderPrompt: string;
}) => Promise<RenderSceneArtResult>;

async function defaultRenderer(_: {
  sceneArtId: string;
  sceneKey: string;
  renderPrompt: string;
}): Promise<RenderSceneArtResult> {
  return {
    imageUrl: "/scene-ready-test.svg",
  };
}

export async function processQueuedSceneArt(args?: {
  limit?: number;
  renderer?: SceneArtRenderer;
}) {
  const limit = args?.limit ?? 5;
  const renderer = args?.renderer ?? defaultRenderer;

  const queuedRows = await prisma.sceneArt.findMany({
    where: { status: "queued" },
    orderBy: [
      { renderPriority: "desc" },
      { createdAt: "asc" },
    ],
    take: limit,
    select: {
      id: true,
      sceneKey: true,
      renderPrompt: true,
    },
  });

  let processed = 0;
  let ready = 0;
  let failed = 0;

  for (const row of queuedRows) {
    try {
      const result = await renderer({
        sceneArtId: row.id,
        sceneKey: row.sceneKey,
        renderPrompt: row.renderPrompt,
      });

      await prisma.sceneArt.update({
        where: { id: row.id },
        data: {
          status: "ready",
          imageUrl: result.imageUrl,
        },
      });

      processed += 1;
      ready += 1;
    } catch (error) {
      await prisma.sceneArt.update({
        where: { id: row.id },
        data: {
          status: "failed",
        },
      });

      processed += 1;
      failed += 1;

      console.error("sceneArt worker failed", {
        sceneArtId: row.id,
        sceneKey: row.sceneKey,
        error,
      });
    }
  }

  return {
    processed,
    ready,
    failed,
  };
}
