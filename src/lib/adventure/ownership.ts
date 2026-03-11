type AdventureOwnerRow = {
  id: string;
  ownerId: string | null;
};

type AdventureOwnershipDb = {
  adventure: {
    findUnique: (args: {
      where: { id: string };
      select: { id: true; ownerId: true };
    }) => Promise<AdventureOwnerRow | null>;
    updateMany: (args: {
      where: { id: string; ownerId: null };
      data: { ownerId: string };
    }) => Promise<{ count: number }>;
  };
};

export class AdventureOwnershipError extends Error {
  status: number;
  code: string;

  constructor(code: string, status: number) {
    super(code);
    this.name = "AdventureOwnershipError";
    this.code = code;
    this.status = status;
  }
}

export async function getOrClaimAdventureForUser(args: {
  db: AdventureOwnershipDb;
  adventureId: string;
  userId: string;
}): Promise<{ adventure: AdventureOwnerRow | null; claimed: boolean }> {
  const { db, adventureId, userId } = args;
  const existing = await db.adventure.findUnique({
    where: { id: adventureId },
    select: { id: true, ownerId: true },
  });

  if (!existing) {
    return { adventure: null, claimed: false };
  }
  if (existing.ownerId === userId) {
    return { adventure: existing, claimed: false };
  }
  if (existing.ownerId) {
    throw new AdventureOwnershipError("ADVENTURE_FORBIDDEN", 403);
  }

  const claim = await db.adventure.updateMany({
    where: { id: adventureId, ownerId: null },
    data: { ownerId: userId },
  });

  if (claim.count === 1) {
    return { adventure: { id: adventureId, ownerId: userId }, claimed: true };
  }

  const reloaded = await db.adventure.findUnique({
    where: { id: adventureId },
    select: { id: true, ownerId: true },
  });
  if (!reloaded) {
    return { adventure: null, claimed: false };
  }
  if (reloaded.ownerId === userId) {
    return { adventure: reloaded, claimed: true };
  }
  if (reloaded.ownerId) {
    throw new AdventureOwnershipError("ADVENTURE_FORBIDDEN", 403);
  }

  throw new AdventureOwnershipError("ADVENTURE_CLAIM_FAILED", 409);
}

export function isAdventureOwnershipError(error: unknown): error is AdventureOwnershipError {
  return error instanceof AdventureOwnershipError;
}

