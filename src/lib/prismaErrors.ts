import { Prisma } from "@prisma/client";

export function isP2002(e: unknown): e is Prisma.PrismaClientKnownRequestError {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

export function p2002Targets(e: unknown): string[] {
  if (!isP2002(e)) return [];
  const t = (e.meta as any)?.target;
  return Array.isArray(t) ? t : (t ? [String(t)] : []);
}
