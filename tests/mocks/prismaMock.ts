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

    async create({ data }: any) {
      const promptHash = data.promptHash;
      const entry: SceneArtRow = {
        ...data,
        imageUrl: data.imageUrl ?? identityImageUrl(data.sceneKey, promptHash),
        attemptCount: data.attemptCount ?? 0,
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

export function resetPrismaMock() {
  store.clear();
}
