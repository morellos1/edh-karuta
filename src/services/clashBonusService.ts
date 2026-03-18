export type ClashBonuses = {
  bonusAttack: number;
  bonusDefense: number;
  bonusHp: number;
  bonusSpeed: number;
  bonusCritRate: number;
};

/**
 * Roll a percentage-based bonus in [5, 50] using "best of N" (for speed & crit).
 * Poor = 1 roll (uniform), Good = best of 2, Mint = best of 3.
 */
export function rollBonus(condition: string): number {
  const rolls = condition === "mint" ? 3 : condition === "good" ? 2 : 1;
  let best = 0;
  for (let i = 0; i < rolls; i++) {
    best = Math.max(best, 5 + Math.floor(Math.random() * 46));
  }
  return best;
}

/**
 * Roll a flat stat bonus in [50, 200] for attack, defense, or HP.
 * Poor = 1 roll, Good = best of 2, Mint = best of 3 with a floor of 150.
 */
export function rollStatBonus(condition: string): number {
  const rolls = condition === "mint" ? 3 : condition === "good" ? 2 : 1;
  let best = 0;
  for (let i = 0; i < rolls; i++) {
    best = Math.max(best, 50 + Math.floor(Math.random() * 151));
  }
  if (condition === "mint") {
    best = Math.max(150, best);
  }
  return best;
}

/** Roll all 5 clash stat bonuses for a legendary creature. */
export function rollClashBonuses(condition: string): ClashBonuses {
  return {
    bonusAttack: rollStatBonus(condition),
    bonusDefense: rollStatBonus(condition),
    bonusHp: rollStatBonus(condition),
    bonusSpeed: rollBonus(condition),
    bonusCritRate: rollBonus(condition),
  };
}

/**
 * One-time migration: re-roll flat stat bonuses that are below the 50 minimum.
 * Old cards may have percentage-based values (5-50) stored before the switch
 * to flat bonuses (50-200). This fixes them by re-rolling with the card's condition.
 */
export async function migrateUndersizedBonuses(): Promise<number> {
  const { prisma } = await import("../db.js");

  const cards = await prisma.userCard.findMany({
    where: {
      OR: [
        { bonusAttack: { not: null, lt: 50 } },
        { bonusDefense: { not: null, lt: 50 } },
        { bonusHp: { not: null, lt: 50 } },
      ],
    },
    select: { id: true, condition: true, bonusAttack: true, bonusDefense: true, bonusHp: true },
  });

  if (cards.length === 0) return 0;

  for (const card of cards) {
    const cond = card.condition ?? "good";
    const updates: Record<string, number> = {};
    if (card.bonusAttack !== null && card.bonusAttack < 50) {
      updates.bonusAttack = rollStatBonus(cond);
    }
    if (card.bonusDefense !== null && card.bonusDefense < 50) {
      updates.bonusDefense = rollStatBonus(cond);
    }
    if (card.bonusHp !== null && card.bonusHp < 50) {
      updates.bonusHp = rollStatBonus(cond);
    }
    await prisma.userCard.update({ where: { id: card.id }, data: updates });
  }

  console.log(`[clash] Re-rolled undersized bonuses on ${cards.length} card(s)`);
  return cards.length;
}
