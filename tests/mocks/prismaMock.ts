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
      };
      store.set(promptHash, { ...entry });
      return { ...entry };
    },

    async update({ where: { sceneKey_promptHash }, data }: any) {
      const { promptHash } = sceneKey_promptHash;
      const existing = store.get(promptHash);
      if (!existing) throw new Error("Row not found");

      const updated = {
        ...existing,
        ...data,
      };
      store.set(promptHash, updated);
      return updated;
    },

    async updateMany({ where: { sceneKey_promptHash, status }, data }: any) {
      const { promptHash } = sceneKey_promptHash;
      const row = store.get(promptHash);
      if (!row || row.status !== status) {
        return { count: 0 };
      }

      const updated = {
        ...row,
        ...data,
      };
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
