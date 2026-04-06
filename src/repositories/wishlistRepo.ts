import { prisma } from "../db.js";

/**
 * Wrap a SQL column/expression so that punctuation characters are stripped
 * before comparison.  Mirrors the JS-side `stripPunctuation` helper below.
 */
function sqlStrip(col: string): string {
  // Same characters as stripPunctuation: ' - , . : ; " ! ?
  const chars = ["''''", "'-'", "','", "'.'", "':'", "';'", "'\"'", "'!'", "CHAR(63)"];
  let expr = col;
  for (const c of chars) {
    expr = `REPLACE(${expr}, ${c}, '')`;
  }
  return expr;
}

/** Strip punctuation on the JS side so both halves of the comparison match. */
function stripPunctuation(s: string): string {
  return s.replace(/['\-,.:;"!?]/g, "");
}

/** Normalize a card name for indexed lookups: strip punctuation and lowercase. */
export function normalizeCardName(s: string): string {
  return stripPunctuation(s).toLowerCase();
}

/** Add a card name to a user's wishlist for a specific guild. */
export async function addWishlistEntry(
  userId: string,
  guildId: string,
  cardName: string
): Promise<void> {
  await prisma.wishlist.create({
    data: { userId, guildId, cardName, cardNameNormalized: normalizeCardName(cardName) }
  });
}

/** Remove a card name from a user's wishlist for a specific guild. Returns true if deleted. */
export async function removeWishlistEntry(
  userId: string,
  guildId: string,
  cardName: string
): Promise<boolean> {
  const normalized = normalizeCardName(cardName);
  const rows = await prisma.$queryRawUnsafe<{ id: number }[]>(
    `SELECT "id" FROM "Wishlist"
     WHERE "userId" = ? AND "guildId" = ? AND "cardNameNormalized" = ?`,
    userId,
    guildId,
    normalized
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
  const normalized = normalizeCardName(cardName);
  const rows = await prisma.$queryRawUnsafe<{ id: number }[]>(
    `SELECT "id" FROM "Wishlist"
     WHERE "userId" = ? AND "guildId" = ? AND "cardNameNormalized" = ?
     LIMIT 1`,
    userId,
    guildId,
    normalized
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
 * Uses the pre-computed cardNameNormalized column for fast indexed lookups.
 * Falls back to the legacy REPLACE-based query for rows that haven't been
 * backfilled yet (cardNameNormalized IS NULL).
 */
export async function findWishlistWatchers(
  guildId: string,
  cardNames: string[]
): Promise<Map<string, string[]>> {
  if (!cardNames.length) return new Map();

  const normalizedNames = cardNames.map(normalizeCardName);
  const placeholders = normalizedNames.map(() => "?").join(", ");

  const entries = await prisma.$queryRawUnsafe<
    { cardName: string; userId: string }[]
  >(
    `SELECT "cardName", "userId" FROM "Wishlist"
     WHERE "guildId" = ? AND "cardNameNormalized" IN (${placeholders})`,
    guildId,
    ...normalizedNames
  );

  const map = new Map<string, string[]>();
  for (const entry of entries) {
    const users = map.get(entry.cardName) ?? [];
    users.push(entry.userId);
    map.set(entry.cardName, users);
  }
  return map;
}
