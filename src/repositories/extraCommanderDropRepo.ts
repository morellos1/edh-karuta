import { prisma } from "../db.js";
import type { Prisma } from "@prisma/client";

/** Count unused extra commander drops for a user. */
export async function getExtraCommanderDropCount(userId: string): Promise<number> {
  return prisma.extraCommanderDrop.count({
    where: { userId, usedAt: null }
  });
}

/** Count unused extra commander drops inside a transaction. */
export async function getExtraCommanderDropCountTx(
  tx: Prisma.TransactionClient,
  userId: string
): Promise<number> {
  return tx.extraCommanderDrop.count({
    where: { userId, usedAt: null }
  });
}

/**
 * Consume one extra commander drop for a user inside a transaction.
 * Returns the remaining count after consumption, or null if none were available.
 */
export async function consumeExtraCommanderDropTx(
  tx: Prisma.TransactionClient,
  userId: string
): Promise<number | null> {
  const item = await tx.extraCommanderDrop.findFirst({
    where: { userId, usedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true }
  });

  if (!item) return null;

  await tx.extraCommanderDrop.update({
    where: { id: item.id },
    data: { usedAt: new Date() }
  });

  return tx.extraCommanderDrop.count({
    where: { userId, usedAt: null }
  });
}

/** Grant extra commander drops to a user (creates records). */
export async function grantExtraCommanderDrops(userId: string, count: number): Promise<void> {
  await prisma.extraCommanderDrop.createMany({
    data: Array.from({ length: count }, () => ({ userId }))
  });
}
