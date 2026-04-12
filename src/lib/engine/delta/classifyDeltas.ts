export type DeltaClassification = {
  flagSets: Array<{ key: string; value: unknown }>;
  timeIncs: Array<{ by: number }>;
  clockIncs: Array<{ id: string; by: number }>;
  damageFlags: string[];
  exposureFlags: string[];
  positionFlags: string[];
  alertFlags: string[];

  hasCostDelta: boolean;
  hasTimeCost: boolean;
  hasNoiseCost: boolean;
  hasAlertCost: boolean;
  hasAlertDelta: boolean;
  hasDamageDelta: boolean;
  hasExposureDelta: boolean;
  hasPositionDelta: boolean;
};

export function classifyDeltas(stateDeltas: unknown[]): DeltaClassification {
  const deltas = Array.isArray(stateDeltas) ? stateDeltas : [];

  const flagSets: Array<{ key: string; value: unknown }> = [];
  const timeIncs: Array<{ by: number }> = [];
  const clockIncs: Array<{ id: string; by: number }> = [];

  for (const delta of deltas) {
    if (!delta || typeof delta !== "object") continue;
    const record = delta as Record<string, unknown>;
    const op = (record.op as string | undefined) ?? (record.kind as string | undefined);

    if (op === "flag.set" && typeof record.key === "string") {
      flagSets.push({ key: record.key, value: record.value });
    }

    if (op === "time.inc") {
      const by = typeof record.by === "number" ? record.by : 1;
      timeIncs.push({ by });
    }

    if (op === "clock.inc" && typeof record.id === "string") {
      const by = typeof record.by === "number" ? record.by : 1;
      clockIncs.push({ id: record.id, by });
    }
  }

  const hasTimeCost = timeIncs.length > 0;
  const hasNoiseCost = clockIncs.some((entry) => entry.id === "clk_noise");
  const hasAlertCost = clockIncs.some((entry) => entry.id === "clk_alert");
  const normalizedFlagKey = (key: string) => key.toLowerCase();
  const damageFlags = flagSets
    .filter((entry) => /damage|damaged|harm/.test(normalizedFlagKey(entry.key)))
    .map((entry) => entry.key);
  const exposureFlags = flagSets
    .filter((entry) => /exposure|exposed/.test(normalizedFlagKey(entry.key)))
    .map((entry) => entry.key);
  const positionFlags = flagSets
    .filter((entry) => {
      const key = normalizedFlagKey(entry.key);
      return (
        /position/.test(key) ||
        key === "status.hidden" ||
        key === "status.exposed"
      );
    })
    .map((entry) => entry.key);
  const alertFlags = flagSets
    .filter((entry) => /alert/.test(normalizedFlagKey(entry.key)))
    .map((entry) => entry.key);

  const hasAlertDelta = hasAlertCost || alertFlags.length > 0;
  const hasDamageDelta = damageFlags.length > 0;
  const hasExposureDelta = exposureFlags.length > 0;
  const hasPositionDelta = positionFlags.length > 0;

  const hasCostDelta = hasTimeCost || hasNoiseCost || hasAlertCost;

  return {
    flagSets,
    timeIncs,
    clockIncs,
    damageFlags,
    exposureFlags,
    positionFlags,
    alertFlags,
    hasCostDelta,
    hasTimeCost,
    hasNoiseCost,
    hasAlertCost,
    hasAlertDelta,
    hasDamageDelta,
    hasExposureDelta,
    hasPositionDelta,
  };
}
