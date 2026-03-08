import { prisma } from "../db.js";

export async function getGold(userId: string): Promise<number> {
  const inv = await prisma.userInventory.findUnique({
    where: { userId },
    select: { gold: true }
  });
  return inv?.gold ?? 0;
}

export async function addGold(userId: string, amount: number): Promise<number> {
  const inv = await prisma.userInventory.upsert({
    where: { userId },
    create: { userId, gold: Math.max(0, amount) },
    update: { gold: { increment: amount } },
    select: { gold: true }
  });
  return inv.gold;
}
