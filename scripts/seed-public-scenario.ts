import { PrismaClient } from "@/generated/prisma";
import { SCENARIO_TEMPLATE_LIBRARY } from "@/lib/creator/scenarioTemplates";

const prisma = new PrismaClient();

async function main() {
  const template =
    SCENARIO_TEMPLATE_LIBRARY.find((item) =>
      item.label.toLowerCase().includes("mystery investigation")
    ) ?? SCENARIO_TEMPLATE_LIBRARY[0];

  if (!template) {
    throw new Error("No scenario template found in SCENARIO_TEMPLATE_LIBRARY");
  }

  const id = "seed_public_scenario";

  const scenario = await prisma.scenario.upsert({
    where: { id },
    update: {
      title: template.scenario.title,
      summary: template.scenario.summary ?? null,
      visibility: "PUBLIC",
      contentJson: template.scenario,
    },
    create: {
      id,
      title: template.scenario.title,
      summary: template.scenario.summary ?? null,
      visibility: "PUBLIC",
      contentJson: template.scenario,
    },
    select: {
      id: true,
      title: true,
      visibility: true,
    },
  });

  console.log("Seeded scenario:", scenario);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
