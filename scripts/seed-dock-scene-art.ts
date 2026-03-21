import { prisma } from "@/lib/prisma";

async function main() {
  const sceneKey = "dock_office";
  const basePrompt = "The dock officer's office, lit by wavering lantern light.";
  const renderPrompt =
    "A moody dockside office with rain dripping outside, rich wooden textures, and a tactical briefing spread on the desk.";
  const payload = {
    sceneKey,
    title: "Dock Officer Office",
    basePrompt,
    renderPrompt,
    stylePreset: "cinematic",
    status: "ready",
    imageUrl: "/default-scene.svg",
  };
  await prisma.sceneArt.upsert({
    where: { sceneKey },
    update: {
      ...payload,
      updatedAt: new Date(),
    },
    create: payload,
  });
  console.log("Seeded scene art row for", sceneKey);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
