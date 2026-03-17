import { prisma } from "../db.js";
import type { Prisma } from "@prisma/client";

/**
 * Generic factory for "extra resource" repositories (extraClaim, extraCommanderDrop,
 * extraLandDrop). All three follow the identical pattern: count unused, consume one
 * inside a transaction, and grant new records.
 */

type ExtraDelegate = {
  count(args: { where: { userId: string; usedAt: null } }): Promise<number>;
  findFirst(args: {
    where: { userId: string; usedAt: null };
    orderBy: { createdAt: "asc" };
    select: { id: true };
  }): Promise<{ id: number } | null>;
  update(args: { where: { id: number }; data: { usedAt: Date } }): Promise<unknown>;
  createMany(args: { data: { userId: string }[] }): Promise<unknown>;
};

function getDelegate(model: "extraClaim" | "extraCommanderDrop" | "extraLandDrop", client: { extraClaim: unknown; extraCommanderDrop: unknown; extraLandDrop: unknown }): ExtraDelegate {
  return client[model] as unknown as ExtraDelegate;
}

export function createExtraResourceRepo(model: "extraClaim" | "extraCommanderDrop" | "extraLandDrop") {
  async function getCount(userId: string): Promise<number> {
    return getDelegate(model, prisma).count({ where: { userId, usedAt: null } });
  }

  async function getCountTx(tx: Prisma.TransactionClient, userId: string): Promise<number> {
    return getDelegate(model, tx).count({ where: { userId, usedAt: null } });
  }

  async function consumeTx(tx: Prisma.TransactionClient, userId: string): Promise<number | null> {
    const delegate = getDelegate(model, tx);
    const item = await delegate.findFirst({
      where: { userId, usedAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true }
    });
    if (!item) return null;
    await delegate.update({ where: { id: item.id }, data: { usedAt: new Date() } });
    return delegate.count({ where: { userId, usedAt: null } });
  }

  async function grant(userId: string, count: number): Promise<void> {
    await getDelegate(model, prisma).createMany({
      data: Array.from({ length: count }, () => ({ userId }))
    });
  }

  return { getCount, getCountTx, consumeTx, grant };
}
