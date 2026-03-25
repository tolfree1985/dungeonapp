type SceneArtRow = Record<string, any>;

const store = new Map<string, SceneArtRow>();

function resolveSceneArtWhere(where: any) {
  if (!where) return {};
  if (where.sceneKey_promptHash) return where.sceneKey_promptHash;
  if (typeof where.promptHash === "string") return where;
  if (typeof where.id === "string") {
    for (const row of store.values()) {
      if (row.id === where.id) {
        return { promptHash: row.promptHash, sceneKey: row.sceneKey };
      }
    }
  }
  return where;
}
export const prismaMock = {
  sceneArt: {
    async findUnique({ where }: any) {
      const resolved = resolveSceneArtWhere(where);
      const { promptHash } = resolved;
      return store.get(promptHash) ?? null;
    },

    async findUniqueOrThrow({ where }: any) {
      const resolved = resolveSceneArtWhere(where);
      const { promptHash } = resolved;
      const row = store.get(promptHash);
      if (!row) throw new Error("Row not found");
      return row;
    },

    async findFirst({ where, orderBy }: any) {
      if (where && typeof where.promptHash === "string") {
        const row = store.get(where.promptHash);
        return row ?? null;
      }

      const entries = Array.from(store.values());
      let candidates = entries;
      if (where?.status) {
        candidates = candidates.filter((row) => row.status === where.status);
      }

      if (orderBy?.createdAt) {
        const direction = orderBy.createdAt === "asc" ? 1 : -1;
        candidates = [...candidates].sort((a, b) => {
          const aTime = a.createdAt?.getTime?.() ?? 0;
          const bTime = b.createdAt?.getTime?.() ?? 0;
          return (aTime - bTime) * direction;
        });
      }

      if (typeof take === "number") {
        candidates = candidates.slice(0, take);
      }

      return candidates[0] ?? null;
    },

    async findMany({ where, orderBy, select, take }: any) {
      const entries = Array.from(store.values());
      let candidates = entries;
      if (where?.status?.in) {
        const statuses = where.status.in;
        candidates = candidates.filter((row) => statuses.includes(row.status));
      }

      if (where?.generationLeaseUntil?.lt) {
        const threshold: Date = where.generationLeaseUntil.lt;
        candidates = candidates.filter((row) => {
          const lease = row.generationLeaseUntil;
          if (!lease) return false;
          const leaseTime = lease instanceof Date ? lease.getTime() : new Date(lease).getTime();
          return leaseTime < threshold.getTime();
        });
      }

      if (orderBy?.createdAt) {
        const direction = orderBy.createdAt === "asc" ? 1 : -1;
        candidates = [...candidates].sort((a, b) => {
          const aTime = a.createdAt?.getTime?.() ?? 0;
          const bTime = b.createdAt?.getTime?.() ?? 0;
          return (aTime - bTime) * direction;
        });
      }

      if (select) {
        return candidates.map((row) => applySelect(row, select));
      }

      return candidates;
    },

    async findFirstOrThrow(args: any) {
      const row = await this.findFirst(args);
      if (!row) throw new Error("Row not found");
      return row;
    },

    async create({ data }: any) {
      const promptHash = data.promptHash;
      const entry: SceneArtRow = {
        ...data,
        imageUrl: data.imageUrl ?? identityImageUrl(data.sceneKey, promptHash),
        attemptCount: data.attemptCount ?? 0,
        createdAt: data.createdAt ?? new Date(),
        status: data.status ?? "queued",
      };
      store.set(promptHash, { ...entry });
      return { ...entry };
    },

    async update({ where, data }: any) {
      const resolved = where.sceneKey_promptHash ?? where;
      const { promptHash } = resolved;
      const existing = store.get(promptHash);
      if (!existing) throw new Error("Row not found");

      const updated: SceneArtRow = {
        ...existing,
        ...data,
      };
      if (data.attemptCount && typeof data.attemptCount === "object" && "increment" in data.attemptCount) {
        const increment = data.attemptCount.increment;
        const base = typeof existing.attemptCount === "number" ? existing.attemptCount : 0;
        updated.attemptCount = base + increment;
      }
      store.set(promptHash, updated);
      return updated;
    },

    async updateMany({ where, data }: any) {
      const resolved = where.sceneKey_promptHash ?? where;
      const promptHash = resolved?.promptHash ?? where?.promptHash;
      const status = resolved?.status ?? where?.status;
      const row = store.get(promptHash);
      const leaseOwnerId = resolved?.leaseOwnerId ?? where?.leaseOwnerId;
      if (!row || (status !== undefined && row.status !== status) || (leaseOwnerId !== undefined && row.leaseOwnerId !== leaseOwnerId)) {
        return { count: 0 };
      }

      const updated: SceneArtRow = {
        ...row,
        ...data,
      };
      if (data.attemptCount && typeof data.attemptCount === "object" && "increment" in data.attemptCount) {
        const increment = data.attemptCount.increment;
        const base = typeof row.attemptCount === "number" ? row.attemptCount : 0;
        updated.attemptCount = base + increment;
      }
      store.set(promptHash, updated);
      return { count: 1 };
    },

    async deleteMany({ where: { sceneKey } }: any) {
      const keysToRemove: string[] = [];
      for (const [key, row] of store.entries()) {
        if (row.sceneKey === sceneKey) {
          keysToRemove.push(key);
        }
      }
      for (const key of keysToRemove) {
        store.delete(key);
      }
      return { count: keysToRemove.length };
    },
  },
};

function identityImageUrl(sceneKey: string, promptHash: string) {
  return `/scene-art/${sceneKey}-${promptHash}.png`;
}

function applySelect(row: SceneArtRow, select: Record<string, boolean>) {
  const result: Record<string, any> = {};
  for (const key of Object.keys(select)) {
    if (select[key]) {
      result[key] = row[key];
    }
  }
  return result;
}

export function resetPrismaMock() {
  store.clear();
}
