import type { AdventureState } from "../types/state";
import type { LedgerEntry } from "../resolveTurnContract";
import type { InventoryDelta } from "../types/inventory";
import { addInventoryItem, findInventoryItem, patchInventoryItemState, removeInventoryItem } from "./helpers";
import { getCatalogItem } from "./catalog";
import type { ParsedInventoryIntent } from "./parseInventoryIntent";

type ResolveInventoryIntentParams = {
  state: AdventureState;
  input: { mode: "DO" | "SAY" | "LOOK"; text: string };
  parsed: ParsedInventoryIntent;
  seed: string;
};

type InventoryItemLite = {
  key: string;
  state?: Record<string, unknown>;
};

function setItemLit(item: InventoryItemLite, lit: boolean): InventoryItemLite {
  return {
    ...item,
    state: {
      ...(item.state ?? {}),
      lit,
    },
  };
}

type ResolveInventoryIntentResult =
  | {
      resolved: true;
      kind: ParsedInventoryIntent["kind"];
      target: string;
      nextState: AdventureState;
      stateDeltas: InventoryDelta[];
      ledgerAdds: LedgerEntry[];
    }
  | {
      resolved: false;
      target: string;
      reason:
        | "item_not_present"
        | "item_not_carried"
        | "already_carried"
        | "item_not_usable"
        | "location_mismatch"
        | "unknown_target";
      stateDeltas: InventoryDelta[];
      ledgerAdds: LedgerEntry[];
  };

function buildLedgerEntry(deltaKind: InventoryDelta["type"], cause: string, effect: string): LedgerEntry {
  return {
    kind: "state_change",
    cause: "inventory",
    effect,
    deltaKind,
  };
}

function buildFailureResponse(
  reason:
    | "item_not_present"
    | "item_not_carried"
    | "item_not_usable"
    | "location_mismatch"
    | "unknown_target"
    | "already_carried",
  target: string,
  ledgerAdds: LedgerEntry[] = [],
): ResolveInventoryIntentResult {
  return {
    resolved: false,
    target,
    reason,
    stateDeltas: [],
    ledgerAdds,
  };
}

export function resolveInventoryIntent(
  params: ResolveInventoryIntentParams,
): ResolveInventoryIntentResult | null {
  const { state, parsed } = params;
  const nextState: AdventureState = (globalThis as typeof globalThis & { structuredClone(value: any): any }).structuredClone(state);
  nextState.inventory = nextState.inventory ?? { items: [] };
  nextState.worldItems = nextState.worldItems ?? [];
  const items = nextState.inventory.items;
  const worldItems = nextState.worldItems;
  const deltas: InventoryDelta[] = [];
  const ledgerAdds: LedgerEntry[] = [];

  const ensureUnexpectedAction = () => null;

  if (parsed.kind === "light") {
    const idx = items.findIndex((item) => item.key === "iron_lantern");
    if (idx === -1) return buildFailureResponse("item_not_carried", "iron_lantern");
    const current = items[idx];
    const alreadyLit = current.state?.lit === true;
    if (alreadyLit) {
      return {
        resolved: true,
        kind: parsed.kind,
        target: current.key,
        nextState,
        stateDeltas: [],
        ledgerAdds: [],
      };
    }
    const updated = setItemLit(current, true);
    nextState.inventory.items[idx] = updated;
    deltas.push({ type: "inventory.state", itemKey: current.key, patch: { lit: true } });
    ledgerAdds.push(
      buildLedgerEntry(
        "inventory.state",
        "You lit the iron lantern.",
        "Detailed inspection is now possible, but your position is easier to notice."
      ),
    );
    console.log("inventory.resolve.debug", {
      action: "light",
      resolved: true,
      targetKey: current.key,
      itemState: nextState.inventory.items[idx].state,
    });
    return {
      resolved: true,
      kind: parsed.kind,
      target: current.key,
      nextState,
      stateDeltas: deltas,
      ledgerAdds,
    };
  }

  if (parsed.kind === "extinguish") {
    const idx = items.findIndex((item) => item.key === "iron_lantern");
    if (idx === -1) return buildFailureResponse("item_not_carried", "iron_lantern");
    const current = items[idx];
    const alreadyUnlit = current.state?.lit !== true;
    if (alreadyUnlit) {
      return {
        resolved: true,
        kind: parsed.kind,
        target: current.key,
        nextState,
        stateDeltas: [],
        ledgerAdds: [],
      };
    }
    const updated = setItemLit(current, false);
    nextState.inventory.items[idx] = updated;
    deltas.push({ type: "inventory.state", itemKey: current.key, patch: { lit: false } });
    ledgerAdds.push(
      buildLedgerEntry(
        "inventory.state",
        "You extinguished the iron lantern.",
        "You are harder to spot, but detailed inspection is reduced."
      ),
    );
    return {
      resolved: true,
      kind: parsed.kind,
      target: current.key,
      nextState,
      stateDeltas: deltas,
      ledgerAdds,
    };
  }

  if (parsed.kind === "drop" || parsed.kind === "stash") {
    const carriedItem = items.find((item) => item.key === parsed.target || item.id === parsed.target);
    if (!carriedItem) {
      return buildFailureResponse("item_not_carried", parsed.target ?? "");
    }
    const nextInventoryItems = items.filter(
      (item) => item.key !== carriedItem.key && item.id !== carriedItem.id,
    );
    const placement = {
      itemId: carriedItem.key,
      locationId: state.currentScene?.locationKey ?? null,
      containerKey: parsed.kind === "stash" ? "local_container" : null,
      concealed: parsed.kind === "stash",
      visible: parsed.kind === "drop",
    };
    const previousWorldEntries = [...worldItems];
    const nextWorldItems = [...worldItems, placement];
    nextState.inventory.items = nextInventoryItems;
    nextState.worldItems = nextWorldItems;
    deltas.push({ type: "inventory.remove", itemKey: carriedItem.key });
    deltas.push({ type: "inventory.transfer_to_world", placement });
    ledgerAdds.push(
      buildLedgerEntry(
        "inventory.transfer_to_world",
        parsed.kind === "drop" ? "You dropped the stolen reliquary." : "You stashed the stolen reliquary.",
        parsed.kind === "drop"
          ? "The burden left your person and now sits exposed in the room."
          : "The burden is no longer on you, but remains hidden in the scene."
      ),
    );
    console.log("inventory.state.transition", {
      action: parsed.kind,
      inventoryBefore: items.map((item) => item.key),
      worldBefore: previousWorldEntries.map((entry) => entry.itemId),
      inventoryAfter: nextInventoryItems.map((item) => item.key),
      worldAfter: nextWorldItems.map((entry) => entry.itemId),
    });
    return {
      resolved: true,
      kind: parsed.kind,
      target: carriedItem.key,
      nextState,
      stateDeltas: deltas,
      ledgerAdds,
    };
  }

  if (parsed.kind === "take") {
    const targetKey = parsed.target ?? "wax_seal_fragment";
    const recovered = getCatalogItem(targetKey);
    if (!recovered) {
      return buildFailureResponse("unknown_target", targetKey);
    }
    if (findInventoryItem(items, recovered.key)) {
      return buildFailureResponse("already_carried", recovered.key);
    }
    const placementIndex = worldItems.findIndex((entry) => entry.itemId === targetKey);
    if (placementIndex === -1) {
      return buildFailureResponse("item_not_present", targetKey);
    }
    const placement = worldItems[placementIndex];
    const previousWorldItems = [...worldItems];
    const nextWorldItems = worldItems.filter((entry, index) => index !== placementIndex);
    nextState.worldItems = nextWorldItems;
    nextState.inventory.items = addInventoryItem(items, recovered);
    deltas.push({ type: "inventory.add", item: recovered });
    deltas.push({ type: "inventory.transfer_to_world", placement });
    ledgerAdds.push(
      buildLedgerEntry(
        "inventory.add",
        "You recovered the wax seal fragment.",
        "You now carry proof that may support accusation or deduction."
      ),
    );
    console.log("inventory.take.debug", {
      parsedTarget: targetKey,
      inventoryBefore: items.map((item) => item.key),
      worldBefore: previousWorldItems.map((entry) => entry.itemId),
      matchedWorldItem: placement,
      inventoryAfter: nextState.inventory.items.map((item) => item.key),
      worldAfter: nextState.worldItems.map((entry) => entry.itemId),
    });
    return {
      resolved: true,
      kind: parsed.kind,
      target: recovered.key,
      nextState,
      stateDeltas: deltas,
      ledgerAdds,
    };
  }

  return buildFailureResponse("unknown_target", parsed.target ?? "");
}
