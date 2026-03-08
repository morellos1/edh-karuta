import test from "node:test";
import assert from "node:assert/strict";
import { computeRemainingCooldownMs } from "./cooldownService.js";

test("computeRemainingCooldownMs returns zero when disabled", () => {
  const remaining = computeRemainingCooldownMs(Date.now() - 1000, 0, Date.now());
  assert.equal(remaining, 0);
});

test("computeRemainingCooldownMs returns positive remainder", () => {
  const now = 10_000;
  const lastClaim = 8_500;
  const remaining = computeRemainingCooldownMs(lastClaim, 3, now);
  assert.equal(remaining, 1_500);
});

test("computeRemainingCooldownMs clamps at zero", () => {
  const now = 20_000;
  const lastClaim = 10_000;
  const remaining = computeRemainingCooldownMs(lastClaim, 5, now);
  assert.equal(remaining, 0);
});
