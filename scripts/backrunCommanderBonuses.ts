/**
 * Backrun: apply commander clash bonuses to marketplace-bought cards
 * that were purchased before bonuses were implemented.
 * Run with: npx tsx scripts/backrunCommanderBonuses.ts
 */
import { prisma } from "../src/db.js";
import { isCommanderEligible } from "../src/services/clashService.js";
import { rollClashBonuses } from "../src/services/clashBonusService.js";

async function main() {
  const cards = await prisma.userCard.findMany({
    where: { bonusAttack: null },
    include: {
      card: {
        select: {
          typeLine: true,
          oracleText: true,
          power: true,
          toughness: true,
          isMeldResult: true,
          layout: true
        }
      }
    }
  });

  let updated = 0;
  for (const uc of cards) {
    if (!isCommanderEligible(uc.card)) continue;
    const bonuses = rollClashBonuses(uc.condition);
    await prisma.userCard.update({
      where: { id: uc.id },
      data: bonuses
    });
    updated++;
  }

  console.log(
    `Backrun complete: applied bonuses to ${updated} commander-eligible cards (${cards.length} total checked).`
  );
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
