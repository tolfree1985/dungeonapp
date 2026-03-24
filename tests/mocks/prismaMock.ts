type SceneArtRow = Record<string, any>;

const store = new Map<string, SceneArtRow>();

export const prismaMock = {
  sceneArt: {
    async findUnique({ where: { sceneKey_promptHash } }: any) {
      const { promptHash } = sceneKey_promptHash;
      return store.get(promptHash) ?? null;
    },

    async findUniqueOrThrow({ where: { sceneKey_promptHash } }: any) {
      const { promptHash } = sceneKey_promptHash;
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

    async update({ where: { sceneKey_promptHash }, data }: any) {
      const { promptHash } = sceneKey_promptHash;
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

    async updateMany({ where: { sceneKey_promptHash, status }, data }: any) {
      const { promptHash } = sceneKey_promptHash;
      const row = store.get(promptHash);
      if (!row || row.status !== status) {
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
