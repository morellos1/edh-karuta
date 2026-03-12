import { prisma } from "../db.js";
import type { Prisma } from "@prisma/client";

/** Count unused extra claims for a user. */
export async function getExtraClaimCount(userId: string): Promise<number> {
  return prisma.extraClaim.count({
    where: { userId, usedAt: null }
  });
}

/** Count unused extra claims inside a transaction. */
export async function getExtraClaimCountTx(
  tx: Prisma.TransactionClient,
  userId: string
): Promise<number> {
  return tx.extraClaim.count({
    where: { userId, usedAt: null }
  });
}

/**
 * Consume one extra claim for a user inside a transaction.
 * Returns the remaining count after consumption, or null if none were available.
 */
export async function consumeExtraClaimTx(
  tx: Prisma.TransactionClient,
  userId: string
): Promise<number | null> {
  const claim = await tx.extraClaim.findFirst({
    where: { userId, usedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true }
  });

  if (!claim) return null;

  await tx.extraClaim.update({
    where: { id: claim.id },
    data: { usedAt: new Date() }
  });

  return tx.extraClaim.count({
    where: { userId, usedAt: null }
  });
}

/** Grant extra claims to a user (creates records). */
export async function grantExtraClaims(userId: string, count: number): Promise<void> {
  await prisma.extraClaim.createMany({
    data: Array.from({ length: count }, () => ({ userId }))
  });
}
