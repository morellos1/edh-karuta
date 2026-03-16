import { prisma } from "../db.js";

export async function getUserCardById(instanceId: number) {
  return prisma.userCard.findUnique({
    where: { id: instanceId },
    include: {
      card: true,
      drop: true
    }
  });
}

export async function getUserCardByDisplayId(displayId: string) {
  return prisma.userCard.findUnique({
    where: { displayId },
    include: {
      card: true,
      drop: true
    }
  });
}

export async function getCardCirculationCount(cardId: number): Promise<number> {
  return prisma.userCard.count({
    where: { cardId }
  });
}

export async function getLastCollectedCard(userId: string) {
  return prisma.userCard.findFirst({
    where: { userId },
    orderBy: { claimedAt: "desc" },
    include: { card: true }
  });
}

/** All user cards with their card data (no pagination). */
export async function getAllUserCards(userId: string) {
  return prisma.userCard.findMany({
    where: { userId },
    include: { card: true },
    orderBy: { claimedAt: "desc" }
  });
}

export async function deleteUserCard(id: number) {
  return prisma.userCard.delete({
    where: { id }
  });
}
