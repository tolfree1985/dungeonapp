export type State = any;

export type StateDelta =
  | { op: "setFlag"; path: string; value: boolean; why?: string }
  | { op: "clearFlag"; path: string; why?: string }
  | { op: "incClock"; path: string; by: number; why?: string }
  | { op: "decClock"; path: string; by: number; why?: string }
  | { op: "setLocation"; path: string; value: string; why?: string }
  | { op: "addItem"; path: string; item: any; why?: string }
  | { op: "removeItem"; path: string; itemId: string; why?: string }
  | { op: "addCondition"; path: string; condition: any; why?: string }
  | { op: "removeCondition"; path: string; conditionId: string; why?: string };

function deepClone<T>(obj: T): T {
  return obj == null ? (obj as T) : JSON.parse(JSON.stringify(obj));
}

// Dot-path setter: "world.flags.doorUnlocked"
function setAtPath(root: any, path: string, value: any) {
  const parts = path.split(".").filter(Boolean);
  if (parts.length === 0) throw new Error(`Invalid path: "${path}"`);
  let cur = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    if (cur[key] == null || typeof cur[key] !== "object") cur[key] = {};
    cur = cur[key];
  }
  cur[parts[parts.length - 1]!] = value;
}

function getAtPath(root: any, path: string) {
  const parts = path.split(".").filter(Boolean);
  if (parts.length === 0) return root;
  let cur = root;
  for (const key of parts) {
    if (cur == null) return undefined;
    cur = cur[key];
  }
  return cur;
}

function ensureArrayAtPath(root: any, path: string): any[] {
  const existing = getAtPath(root, path);
  if (Array.isArray(existing)) return existing;

  // Create the array if missing (MVP-friendly)
  setAtPath(root, path, []);
  const created = getAtPath(root, path);
  if (!Array.isArray(created)) throw new Error(`Failed to create array at path: ${path}`);
  return created;
}

// Clock path format: "world.clocks[clk_noise]"
function parseClockPath(path: string) {
  const m = path.match(/^(.*)\.clocks\[(.+)\]$/);
  if (!m) return null;
  return { base: m[1]!, clockId: m[2]! };
}

function findClock(state: any, path: string) {
  const parsed = parseClockPath(path);
  if (!parsed) return { clocks: undefined as any[] | undefined, idx: -1, clockId: "" };

  const clocks = getAtPath(state, `${parsed.base}.clocks`) as any[] | undefined;
  const idx = Array.isArray(clocks) ? clocks.findIndex((c) => c?.id === parsed.clockId) : -1;
  return { clocks, idx, clockId: parsed.clockId };
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function applyStateDeltas(state: State, deltas: StateDelta[]): State {
  const next = deepClone(state);

  for (const d of deltas) {
    switch (d.op) {
      case "setFlag":
        setAtPath(next, d.path, !!d.value);
        break;

      case "clearFlag":
        setAtPath(next, d.path, false);
        break;

      case "incClock": {
        const { clocks, idx } = findClock(next, d.path);
        if (!clocks || idx < 0) throw new Error(`Clock not found for path: ${d.path}`);

        const c = clocks[idx];
        const max = typeof c.max === "number" ? c.max : 999;
        const cur = typeof c.current === "number" ? c.current : 0;
        const by = typeof d.by === "number" ? d.by : 1;

        // ✅ Clamp to [0, max]
        c.current = clamp(cur + by, 0, max);
        break;
      }

      case "decClock": {
        const { clocks, idx } = findClock(next, d.path);
        if (!clocks || idx < 0) throw new Error(`Clock not found for path: ${d.path}`);

        const c = clocks[idx];
        const max = typeof c.max === "number" ? c.max : 999;
        const cur = typeof c.current === "number" ? c.current : 0;
        const by = typeof d.by === "number" ? d.by : 1;

        // ✅ Clamp to [0, max]
        c.current = clamp(cur - by, 0, max);
        break;
      }

      case "setLocation":
        setAtPath(next, d.path, d.value);
        break;

      case "addItem": {
        const arr = ensureArrayAtPath(next, d.path);
        arr.push(d.item);
        break;
      }

      case "removeItem": {
        const arr = getAtPath(next, d.path);
        if (!Array.isArray(arr)) throw new Error(`removeItem path is not an array: ${d.path}`);
        const i = arr.findIndex((x) => x?.id === d.itemId);
        if (i >= 0) arr.splice(i, 1);
        break;
      }

      case "addCondition": {
        const arr = ensureArrayAtPath(next, d.path);
        arr.push(d.condition);
        break;
      }

      case "removeCondition": {
        const arr = getAtPath(next, d.path);
        if (!Array.isArray(arr)) throw new Error(`removeCondition path is not an array: ${d.path}`);
        const i = arr.findIndex((x) => x?.id === d.conditionId);
        if (i >= 0) arr.splice(i, 1);
        break;
      }

      default:
        // @ts-expect-error exhaustive
        throw new Error(`Unknown delta op: ${d.op}`);
    }
  }

  return next;
}
