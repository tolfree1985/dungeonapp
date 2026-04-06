import type { InventoryItem } from "./inventory";
import type { StateDelta } from "@/lib/engine/resolveTurnContract";

export type InventoryAffordanceContext = {
  mode: "DO" | "SAY" | "LOOK";
  input: string;
  inventoryContext: {
    carriedItems: Array<{ key: string; lit: boolean; capabilities: string[] }>;
    referencedItems: string[];
    capabilities: string[];
  };
  state: Record<string, unknown> | null;
};

export type InventoryAffordanceResult = {
  matched: boolean;
  stateDeltas: StateDelta[];
  ledgerAdds: Record<string, unknown>[];
};

export type InventoryAffordanceRule = {
  id: string;
  priority: number;
  referencedItemKeys?: string[];
  evaluate: (ctx: InventoryAffordanceContext) => InventoryAffordanceResult | null;
};
