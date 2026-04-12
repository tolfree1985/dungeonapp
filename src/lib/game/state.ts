// src/lib/game/state.ts
import type { GameStateV1 } from "./types";
import type { StateDelta } from "./deltas";
/**
 * Pure, deterministic application of deltas.
 * - No side effects
 * - Throws on illegal / inconsistent deltas (good for catching engine bugs early)
 */
export function applyDeltas(state: GameStateV1, deltas: StateDelta[] | any): GameStateV1 {
  const s: GameStateV1 = structuredClone(state);

  const list: StateDelta[] = Array.isArray(deltas) ? deltas : (deltas as any)?.deltas ?? [];
  for (const d of list) {
    switch (d.op) {
      case "time.inc": {
        if (!Number.isFinite(d.by)) throw new Error("time.inc: by must be finite");
        s.world.time += d.by;
        break;
      }

      case "flag.set": {
        if (!d.key) throw new Error("flag.set: key required");
        s.world.flags[d.key] = d.value;
        break;
      }

      case "modifier.set": {
        const key = d.key;
        const value = d.value;
        if (!key) throw new Error("modifier.set: key required");
        if (!s.modifiers || typeof s.modifiers !== "object") {
          s.modifiers = {} as Record<string, unknown>;
        }
        s.modifiers[key] = value;
        break;
      }

      case "clock.inc": {
        const clocksAny:any = (s as any).world?.clocks;
        const c = Array.isArray(clocksAny) ? clocksAny.find((x:any)=>x?.id===d.id) : clocksAny?.[d.id];
        if (!c) throw new Error(`clock.inc: unknown clock '${d.id}'`);
        if (!Number.isFinite(d.by)) throw new Error("clock.inc: by must be finite");
        c.value += d.by;
        if (c.value < 0) c.value = 0;
        break;
      }

      case "clock.set": {
        const clocksAny:any = (s as any).world?.clocks;
        const c = Array.isArray(clocksAny) ? clocksAny.find((x:any)=>x?.id===d.id) : clocksAny?.[d.id];
        if (!c) throw new Error(`clock.set: unknown clock '${d.id}'`);
        if (!Number.isFinite(d.value)) throw new Error("clock.set: value must be finite");
        c.value = Math.max(0, d.value);
        break;
      }

      case "inv.add": {
        const it = d.item;
        if (!it?.id || !it?.name) throw new Error("inv.add: item.id and item.name required");

        const addQty = it.qty ?? 1;
        if (!Number.isFinite(addQty) || addQty <= 0) throw new Error("inv.add: qty must be > 0");

        const existing = s.inventory[it.id];
        if (existing) {
          existing.qty = (existing.qty ?? 1) + addQty;
          if (it.tags?.length) {
            const set = new Set([...(existing.tags ?? []), ...it.tags]);
            existing.tags = Array.from(set);
          }
        } else {
          s.inventory[it.id] = { ...it, qty: addQty };
        }
        break;
      }

      case "inv.remove": {
        if (!d.id) throw new Error("inv.remove: id required");
        const existing = s.inventory[d.id];
        if (!existing) break;

        const remQty = d.qty ?? 1;
        if (!Number.isFinite(remQty) || remQty <= 0) throw new Error("inv.remove: qty must be > 0");

        const next = (existing.qty ?? 1) - remQty;
        if (next <= 0) delete s.inventory[d.id];
        else existing.qty = next;
        break;
      }

      case "move": {
        const fromId = s.world.locationId;
        const from = s.map.nodes[fromId];
        if (!from) throw new Error(`move: unknown current location '${fromId}'`);
        if (!s.map.nodes[d.to]) throw new Error(`move: unknown destination '${d.to}'`);
        if (!from.exits.includes(d.to)) throw new Error(`move: illegal edge '${fromId}' -> '${d.to}'`);
        s.world.locationId = d.to;
        break;
      }

      case "action.block": {
        const key = d.key;
        const value = d.value;
        if (!key) throw new Error("action.block: key required");
        if (!s.blockedActions || typeof s.blockedActions !== "object") {
          s.blockedActions = {} as Record<string, boolean>;
        }
        s.blockedActions[key] = Boolean(value);
        break;
      }

      case "intercepts.upsert": {
        const incoming = (d as any).value ?? {};
        const setRaw = Array.isArray(incoming.set) ? incoming.set : [];
        const removeRaw = Array.isArray(incoming.remove) ? incoming.remove : [];
        const historyAppendRaw = Array.isArray(incoming.historyAppend) ? incoming.historyAppend : [];

        const prev = ((s as any).intercepts ?? { active: [], history: [] }) as {
          active: any[];
          history: any[];
        };

        const remove = new Set(removeRaw.map((x: any) => String(x)));
        const byId = new Map<string, any>();

        for (const it of Array.isArray(prev.active) ? prev.active : []) {
          const id = String(it?.id ?? "unknown");
          if (!remove.has(id)) byId.set(id, it);
        }

        for (const i of setRaw) {
          const normalized = {
            escalation: 0,
            ...i,
            id: String(i?.id ?? "unknown"),
            spawnedTurn: Number(i?.spawnedTurn ?? 0),
            expiresTurn: Number(i?.expiresTurn ?? 0),
          };
          if (!remove.has(normalized.id)) byId.set(normalized.id, normalized);
        }

        const nextActive = Array.from(byId.values()).sort((a: any, b: any) => {
          if (a.spawnedTurn !== b.spawnedTurn) return a.spawnedTurn - b.spawnedTurn;
          return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
        });

        const baseHistory = Array.isArray(prev.history) ? prev.history : [];
        const nextHistory =
          historyAppendRaw.length > 0 ? [...baseHistory, ...historyAppendRaw] : baseHistory;

        (s as any).intercepts = { active: nextActive, history: nextHistory };
        break;
      }

      default: {
        throw new Error(`applyDeltas: unknown delta op '${(d as any)?.op}'`);
      }
    }
  }

  return s;
}
