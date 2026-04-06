import type { InventoryAffordanceContext, InventoryAffordanceResult } from "./types/inventoryAffordance";

export function requireReferencedItem(
  ctx: InventoryAffordanceContext,
  itemKey: string,
  inputAlias?: string[],
): boolean {
  const carries = ctx.inventoryContext.carriedItems.some((item) => item.key === itemKey);
  if (!carries) return false;
  if (!inputAlias) return true;
  const text = ctx.input.toLowerCase();
  return inputAlias.some((alias) => text.includes(alias));
}

export function requireFlag(ctx: InventoryAffordanceContext, flag: string): boolean {
  const flags = (ctx.state as Record<string, unknown>)?.flags as Record<string, unknown> | undefined;
  return Boolean(flags?.[flag]);
}

export function emitFlag(key: string, value = true): InventoryAffordanceResult {
  return {
    matched: true,
    stateDeltas: [{ kind: "flag.set", key, value }],
    ledgerAdds: [
      {
        kind: "state_change",
        cause: "inventory",
        effect: `${key} set to ${value}`,
        deltaKind: "flag.set",
      },
    ],
  };
}

export function emitPressure(domain: string, amount: number): InventoryAffordanceResult {
  return {
    matched: true,
    stateDeltas: [{ kind: "pressure.add", domain, amount }],
    ledgerAdds: [],
  };
}

export function mergeResults(primary: InventoryAffordanceResult, secondary: InventoryAffordanceResult) {
  return {
    matched: true,
    stateDeltas: [...primary.stateDeltas, ...secondary.stateDeltas],
    ledgerAdds: [...primary.ledgerAdds, ...secondary.ledgerAdds],
  };
}
