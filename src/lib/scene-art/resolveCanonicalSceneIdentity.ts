export type CanonicalSceneIdentity = {
  sceneKey: string | null;
  promptHash: string | null;
};

type IdentityInput =
  | {
      sceneKey?: string | null;
      promptHash?: string | null;
    }
  | null
  | undefined;

export function resolveCanonicalSceneIdentity(
  input: IdentityInput,
): CanonicalSceneIdentity {
  return {
    sceneKey:
      typeof input?.sceneKey === "string" && input.sceneKey.length > 0
        ? input.sceneKey
        : null,
    promptHash:
      typeof input?.promptHash === "string" && input.promptHash.length > 0
        ? input.promptHash
        : null,
  };
}
