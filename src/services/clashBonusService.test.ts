import test from "node:test";
import assert from "node:assert/strict";
import { rollBonus, rollClashBonuses } from "./clashBonusService.js";

test("rollBonus returns values in [5, 50]", () => {
  for (const condition of ["poor", "good", "mint"]) {
    for (let i = 0; i < 200; i++) {
      const val = rollBonus(condition);
      assert.ok(val >= 5, `Expected >= 5, got ${val} for ${condition}`);
      assert.ok(val <= 50, `Expected <= 50, got ${val} for ${condition}`);
    }
  }
});

test("rollClashBonuses returns all 5 fields in range", () => {
  const bonuses = rollClashBonuses("good");
  for (const key of ["bonusAttack", "bonusDefense", "bonusHp", "bonusSpeed", "bonusCritRate"] as const) {
    assert.ok(bonuses[key] >= 5, `${key} should be >= 5`);
    assert.ok(bonuses[key] <= 50, `${key} should be <= 50`);
  }
});

test("mint rolls higher than poor on average", () => {
  const N = 2000;
  let poorSum = 0;
  let mintSum = 0;
  for (let i = 0; i < N; i++) {
    poorSum += rollBonus("poor");
    mintSum += rollBonus("mint");
  }
  const poorMean = poorSum / N;
  const mintMean = mintSum / N;
  // Mint (best of 3) should average significantly higher than poor (1 roll)
  assert.ok(mintMean > poorMean + 5, `Expected mint mean (${mintMean.toFixed(1)}) > poor mean (${poorMean.toFixed(1)}) + 5`);
});
