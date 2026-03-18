export type ClashBonuses = {
  bonusAttack: number;
  bonusDefense: number;
  bonusHp: number;
  bonusSpeed: number;
  bonusCritRate: number;
};

/**
 * Roll a single bonus value in [5, 50] using "best of N" based on condition.
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

/** Roll all 5 clash stat bonuses for a legendary creature. */
export function rollClashBonuses(condition: string): ClashBonuses {
  return {
    bonusAttack: rollBonus(condition),
    bonusDefense: rollBonus(condition),
    bonusHp: rollBonus(condition),
    bonusSpeed: rollBonus(condition),
    bonusCritRate: rollBonus(condition),
  };
}
