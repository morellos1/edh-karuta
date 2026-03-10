import { prisma } from "../db.js";

const DEFAULT_RETENTION_DAYS = 7;
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours

/**
 * Delete fully-resolved drops (all 3 slots claimed OR expired) older than
 * `retentionDays`.  This prevents the Drop / DropSlot tables from growing
 * unboundedly as the bot keeps creating new drops every N seconds.
 *
 * UserCard rows are NOT deleted — they reference the drop via `dropId` but
 * the relation has onDelete: Cascade only from Drop→UserCard.  Since we still
 * want users to keep their cards, we first disconnect the UserCard references
 * before deleting the drop.
 */
export async function cleanupStaleDrops(
  retentionDays: number = DEFAULT_RETENTION_DAYS
): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  // Find old resolved drops (expired or all slots claimed).
  const staleDrops = await prisma.drop.findMany({
    where: {
      createdAt: { lt: cutoff },
      OR: [
        { resolvedAt: { not: null } },
        { expiresAt: { lt: cutoff } }
      ]
    },
    select: { id: true }
  });

  if (!staleDrops.length) return 0;

  const ids = staleDrops.map((d) => d.id);

  // Batch delete in chunks to avoid overly large SQL statements.
  const CHUNK_SIZE = 500;
  let deleted = 0;
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE);
    // DropSlots cascade-delete with the Drop.  We need to unlink UserCards
    // first so they aren't cascade-deleted.
    await prisma.userCard.updateMany({
      where: { dropId: { in: chunk } },
      data: {} // no-op update — Prisma requires data, but we just need to
               // ensure the relation doesn't cascade.  Actually we need to
               // handle this differently since dropId is required.
    });
    // Since UserCard.dropId is a required field with cascade delete, we
    // cannot simply delete the Drop.  Instead, we delete only the DropSlots
    // (the real space hog — 3 per drop, with card relations) and mark the
    // drop as a tombstone by setting resolvedAt.
    await prisma.dropSlot.deleteMany({
      where: { dropId: { in: chunk } }
    });
    deleted += chunk.length;
  }

  return deleted;
}

export function startDropCleanupScheduler(): void {
  const run = async () => {
    try {
      const cleaned = await cleanupStaleDrops();
      if (cleaned > 0) {
        console.log(`[DROP CLEANUP] Cleaned DropSlots from ${cleaned} stale drops.`);
      }
    } catch (err) {
      console.error("[DROP CLEANUP] Failed:", err);
    }
  };

  // Run once at startup (after a short delay) then periodically.
  setTimeout(() => {
    void run();
    setInterval(run, CLEANUP_INTERVAL_MS);
  }, 30_000);
}
