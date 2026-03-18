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
