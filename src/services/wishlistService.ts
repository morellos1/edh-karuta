import { findWishlistWatchers } from "../repositories/wishlistRepo.js";

/**
 * Build a wishlist notification string for a set of dropping cards.
 * Returns null if no one is watching any of the card names.
 */
export async function buildWishlistNotification(
  guildId: string,
  cardNames: string[]
): Promise<string | null> {
  const watchers = await findWishlistWatchers(guildId, cardNames);
  if (!watchers.size) return null;

  // Collect unique user IDs across all matched cards
  const userIds = new Set<string>();
  for (const ids of watchers.values()) {
    for (const id of ids) {
      userIds.add(id);
    }
  }

  if (!userIds.size) return null;

  const mentions = [...userIds].map((id) => `<@${id}>`).join(" ");
  return `A card from your wishlist is dropping! ${mentions}`;
}
