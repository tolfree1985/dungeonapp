import type { PrismaClient } from "@/generated/prisma";
import type { AdventureState } from "@/lib/engine/types/state";
import { normalizeScenarioContent } from "@/lib/scenario/scenarioValidator";
import { buildScenarioVersionStamp } from "@/lib/scenario/scenarioVersion";
import { ENGINE_VERSION } from "@/lib/game/engineVersion";

export const STATE_SCHEMA_VERSION = 1;

export type CompatibilityInfo = {
  engineVersion: string;
  scenarioContentHash: string;
  scenarioVersion: number;
  stateSchemaVersion: number;
};

class CompatibilityError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "CompatibilityError";
  }
}

export function buildCompatibilityInfo(args: {
  scenarioVersion: number;
  scenarioContentHash: string;
}): CompatibilityInfo {
  return {
    engineVersion: ENGINE_VERSION,
    scenarioVersion: args.scenarioVersion,
    scenarioContentHash: args.scenarioContentHash,
    stateSchemaVersion: STATE_SCHEMA_VERSION,
  };
}

export function verifyCompatibility(args: {
  actual?: CompatibilityInfo | null;
  expectedScenarioVersion: number;
  expectedScenarioContentHash: string;
}): CompatibilityInfo {
  const { actual } = args;
  if (!actual) {
    throw new CompatibilityError("COMPATIBILITY_MISSING", "Adventure compatibility data missing");
  }
  if (actual.engineVersion !== ENGINE_VERSION) {
    throw new CompatibilityError(
      "COMPATIBILITY_ENGINE_MISMATCH",
      `Expected engineVersion=${ENGINE_VERSION} but got ${actual.engineVersion}`,
    );
  }
  if (actual.stateSchemaVersion !== STATE_SCHEMA_VERSION) {
    throw new CompatibilityError(
      "COMPATIBILITY_SCHEMA_MISMATCH",
      `Expected stateSchemaVersion=${STATE_SCHEMA_VERSION} but got ${actual.stateSchemaVersion}`,
    );
  }
  if (actual.scenarioVersion !== args.expectedScenarioVersion) {
    throw new CompatibilityError(
      "COMPATIBILITY_SCENARIO_VERSION_MISMATCH",
      `Expected scenarioVersion=${args.expectedScenarioVersion} but got ${actual.scenarioVersion}`,
    );
  }
  if (actual.scenarioContentHash !== args.expectedScenarioContentHash) {
    throw new CompatibilityError(
      "COMPATIBILITY_SCENARIO_HASH_MISMATCH",
      "Scenario content hash mismatch",
    );
  }
  return actual;
}

export async function assertAdventureCompatibility(args: {
  db: Pick<PrismaClient, "scenario">;
  state: AdventureState;
}): Promise<CompatibilityInfo> {
  const meta = (args.state._meta ?? {}) as Record<string, unknown>;
  const compatibility = (meta.compatibility ?? null) as CompatibilityInfo | null;
  const scenarioId = typeof meta.scenarioId === "string" ? meta.scenarioId : null;

  if (!scenarioId) {
    throw new CompatibilityError("COMPATIBILITY_SCENARIO_ID_MISSING", "Scenario id missing from adventure metadata");
  }

  const scenarioRow = await args.db.scenario.findUnique({
    where: { id: scenarioId },
    select: { contentJson: true },
  });

  if (!scenarioRow) {
    throw new CompatibilityError("COMPATIBILITY_SCENARIO_MISSING", `Scenario not found: ${scenarioId}`);
  }

  const normalized = normalizeScenarioContent(scenarioRow.contentJson, scenarioId);
  const stamp = buildScenarioVersionStamp(normalized);
  return verifyCompatibility({
    actual: compatibility,
    expectedScenarioVersion: stamp.scenarioVersion,
    expectedScenarioContentHash: stamp.contentHash,
  });
}

export { CompatibilityError };
