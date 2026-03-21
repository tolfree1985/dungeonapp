export type PersistShotArgs = {
  previousShotKey: string | null;
  currentShotKey: string | null;
  previousShotDuration: number;
  shotPersisted: boolean;
};

export type PersistShotResult = {
  shotDuration: number;
  shotPersisted: boolean;
};

export function persistShot({
  previousShotKey,
  currentShotKey,
  previousShotDuration,
  shotPersisted,
}: PersistShotArgs): PersistShotResult {
  if (shotPersisted && previousShotKey !== currentShotKey) {
    throw new Error("shot persistence invariant violated");
  }
  const shotDuration = shotPersisted ? previousShotDuration + 1 : 1;
  return { shotDuration, shotPersisted };
}
