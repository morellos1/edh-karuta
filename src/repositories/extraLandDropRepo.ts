import { prisma } from "../db.js";
import type { Prisma } from "@prisma/client";

/** Count unused extra land drops for a user. */
export async function getExtraLandDropCount(userId: string): Promise<number> {
  return prisma.extraLandDrop.count({
    where: { userId, usedAt: null }
  });
}

/** Count unused extra land drops inside a transaction. */
export async function getExtraLandDropCountTx(
  tx: Prisma.TransactionClient,
  userId: string
): Promise<number> {
  return tx.extraLandDrop.count({
    where: { userId, usedAt: null }
  });
}

/**
 * Consume one extra land drop for a user inside a transaction.
 * Returns the remaining count after consumption, or null if none were available.
 */
export async function consumeExtraLandDropTx(
  tx: Prisma.TransactionClient,
  userId: string
): Promise<number | null> {
  const item = await tx.extraLandDrop.findFirst({
    where: { userId, usedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true }
  });

  if (!item) return null;

  await tx.extraLandDrop.update({
    where: { id: item.id },
    data: { usedAt: new Date() }
  });

  return tx.extraLandDrop.count({
    where: { userId, usedAt: null }
  });
}

/** Grant extra land drops to a user (creates records). */
export async function grantExtraLandDrops(userId: string, count: number): Promise<void> {
  await prisma.extraLandDrop.createMany({
    data: Array.from({ length: count }, () => ({ userId }))
  });
}
