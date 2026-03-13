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
  const rows = await prisma.$queryRawUnsafe<{ id: number }[]>(
    `SELECT "id" FROM "Wishlist"
     WHERE "userId" = ? AND "guildId" = ? AND "cardName" COLLATE NOCASE = ?`,
    userId,
    guildId,
    cardName
  );
  if (!rows.length) return false;

  await prisma.wishlist.deleteMany({
    where: { id: { in: rows.map((r) => r.id) } }
  });
  return true;
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
  const rows = await prisma.$queryRawUnsafe<{ id: number }[]>(
    `SELECT "id" FROM "Wishlist"
     WHERE "userId" = ? AND "guildId" = ? AND "cardName" COLLATE NOCASE = ?
     LIMIT 1`,
    userId,
    guildId,
    cardName
  );
  return rows.length > 0;
}

/** Count how many distinct users have this card name wishlisted (across all guilds). */
export async function getWishlistCardCount(cardName: string): Promise<number> {
  const result = await prisma.wishlist.groupBy({
    by: ["userId"],
    where: { cardName }
  });
  return result.length;
}

/**
 * Given a list of card names being dropped and a guild ID,
 * find all users who have any of those names on their wishlist.
 * Returns a map of cardName → userId[].
 *
 * Uses case-insensitive matching (COLLATE NOCASE) so that wishlist
 * entries still match even if card-name casing drifts between Scryfall syncs.
 */
export async function findWishlistWatchers(
  guildId: string,
  cardNames: string[]
): Promise<Map<string, string[]>> {
  if (!cardNames.length) return new Map();

  const placeholders = cardNames.map(() => "?").join(", ");
  const entries = await prisma.$queryRawUnsafe<
    { cardName: string; userId: string }[]
  >(
    `SELECT "cardName", "userId" FROM "Wishlist"
     WHERE "guildId" = ? AND "cardName" COLLATE NOCASE IN (${placeholders})`,
    guildId,
    ...cardNames
  );

  const map = new Map<string, string[]>();
  for (const entry of entries) {
    const users = map.get(entry.cardName) ?? [];
    users.push(entry.userId);
    map.set(entry.cardName, users);
  }
  return map;
}
