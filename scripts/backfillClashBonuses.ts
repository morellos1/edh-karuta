/**
 * Backfill clash stat bonuses for existing legendary creature cards.
 * Run with: npx tsx scripts/backfillClashBonuses.ts
 */
import { prisma } from "../src/db.js";
import { isLegendaryCreature } from "../src/services/clashService.js";
import { rollClashBonuses } from "../src/services/clashBonusService.js";

async function main() {
  // Find all UserCards that have no bonuses set yet
  const cards = await prisma.userCard.findMany({
    where: { bonusAttack: null },
    include: { card: { select: { typeLine: true, isMeldResult: true } } }
  });

  let updated = 0;
  for (const uc of cards) {
    if (!isLegendaryCreature(uc.card.typeLine, { isMeldResult: uc.card.isMeldResult })) {
      continue;
    }
    const bonuses = rollClashBonuses(uc.condition);
    await prisma.userCard.update({
      where: { id: uc.id },
      data: bonuses
    });
    updated++;
  }

  console.log(`Backfilled bonuses for ${updated} legendary creature cards (out of ${cards.length} total cards checked).`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
