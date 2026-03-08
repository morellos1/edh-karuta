/**
 * Resets the entire collection: removes all UserCard records and clears
 * DropSlot claimed state so no cards are owned and drops show as unclaimed.
 * Run with: npx tsx scripts/resetCollection.ts
 */
import { prisma } from "../src/db.js";

async function main() {
  const deletedUserCards = await prisma.userCard.deleteMany({});
  const updatedSlots = await prisma.dropSlot.updateMany({
    data: { claimedByUserId: null, claimedAt: null }
  });
  console.log(
    `Reset complete: deleted ${deletedUserCards.count} collected cards, cleared ${updatedSlots.count} drop slot claims.`
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
