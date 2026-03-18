import test from "node:test";
import assert from "node:assert/strict";
import { rollBonus, rollStatBonus, rollClashBonuses } from "./clashBonusService.js";

test("rollBonus returns values in [5, 50]", () => {
  for (const condition of ["poor", "good", "mint"]) {
    for (let i = 0; i < 200; i++) {
      const val = rollBonus(condition);
      assert.ok(val >= 5, `Expected >= 5, got ${val} for ${condition}`);
      assert.ok(val <= 50, `Expected <= 50, got ${val} for ${condition}`);
    }
  }
});

test("rollStatBonus returns values in [50, 200]", () => {
  for (const condition of ["poor", "good", "mint"]) {
    for (let i = 0; i < 200; i++) {
      const val = rollStatBonus(condition);
      assert.ok(val >= 50, `Expected >= 50, got ${val} for ${condition}`);
      assert.ok(val <= 200, `Expected <= 200, got ${val} for ${condition}`);
    }
  }
});

test("rollStatBonus mint always returns 150+", () => {
  for (let i = 0; i < 500; i++) {
    const val = rollStatBonus("mint");
    assert.ok(val >= 150, `Expected mint >= 150, got ${val}`);
  }
});

test("rollClashBonuses returns all 5 fields in range", () => {
  const bonuses = rollClashBonuses("good");
  for (const key of ["bonusAttack", "bonusDefense", "bonusHp"] as const) {
    assert.ok(bonuses[key] >= 50, `${key} should be >= 50`);
    assert.ok(bonuses[key] <= 200, `${key} should be <= 200`);
  }
  for (const key of ["bonusSpeed", "bonusCritRate"] as const) {
    assert.ok(bonuses[key] >= 5, `${key} should be >= 5`);
    assert.ok(bonuses[key] <= 50, `${key} should be <= 50`);
  }
});

test("mint rolls higher than poor on average", () => {
  const N = 2000;
  let poorSum = 0;
  let mintSum = 0;
  for (let i = 0; i < N; i++) {
    poorSum += rollStatBonus("poor");
    mintSum += rollStatBonus("mint");
  }
  const poorMean = poorSum / N;
  const mintMean = mintSum / N;
  // Mint (best of 3, floor 150) should average significantly higher than poor (1 roll)
  assert.ok(mintMean > poorMean + 30, `Expected mint mean (${mintMean.toFixed(1)}) > poor mean (${poorMean.toFixed(1)}) + 30`);
});
