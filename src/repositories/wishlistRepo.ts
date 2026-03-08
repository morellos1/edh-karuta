import { prisma } from "../db.js";

/** Add a card name to a user's wishlist for a specific guild. */
export async function addWishlistEntry(
  userId: string,
  guildId: string,
  cardName: string
): Promise<void> {
  await prisma.wishlist.create({
    data: { userId, guildId, cardName }
  });
}

/** Remove a card name from a user's wishlist for a specific guild. Returns true if deleted. */
export async function removeWishlistEntry(
  userId: string,
  guildId: string,
  cardName: string
): Promise<boolean> {
  const result = await prisma.wishlist.deleteMany({
    where: { userId, guildId, cardName }
  });
  return result.count > 0;
}

/** Get all wishlist entries for a user in a guild. */
export async function getUserWishlist(
  userId: string,
  guildId: string
): Promise<{ cardName: string; createdAt: Date }[]> {
  return prisma.wishlist.findMany({
    where: { userId, guildId },
    select: { cardName: true, createdAt: true },
    orderBy: { createdAt: "asc" }
  });
}

/** Count how many wishlist entries a user has in a guild. */
export async function getUserWishlistCount(
  userId: string,
  guildId: string
): Promise<number> {
  return prisma.wishlist.count({
    where: { userId, guildId }
  });
}

/** Check if a user already has a specific card name on their wishlist in a guild. */
export async function wishlistEntryExists(
  userId: string,
  guildId: string,
  cardName: string
): Promise<boolean> {
  const entry = await prisma.wishlist.findUnique({
    where: { userId_guildId_cardName: { userId, guildId, cardName } }
  });
  return entry !== null;
}

/**
 * Given a list of card names being dropped and a guild ID,
 * find all users who have any of those names on their wishlist.
 * Returns a map of cardName → userId[].
 */
export async function findWishlistWatchers(
  guildId: string,
  cardNames: string[]
): Promise<Map<string, string[]>> {
  if (!cardNames.length) return new Map();
  const entries = await prisma.wishlist.findMany({
    where: {
      guildId,
      cardName: { in: cardNames }
    },
    select: { cardName: true, userId: true }
  });
  const map = new Map<string, string[]>();
  for (const entry of entries) {
    const users = map.get(entry.cardName) ?? [];
    users.push(entry.userId);
    map.set(entry.cardName, users);
  }
  return map;
}
