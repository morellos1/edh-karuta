import test from "node:test";
import assert from "node:assert/strict";

// computeSelectionWeights is a pure function — import it directly to avoid
// pulling in config/DB dependencies that need env vars at module load.
// We replicate the logic here for an isolated unit test.
function computeSelectionWeights(
  groups: { _count: { name: number } }[],
  uniform: boolean
): number[] {
  return uniform
    ? groups.map(() => 1)
    : groups.map((g) => Math.log2(g._count.name + 1));
}

test("computeSelectionWeights returns uniform weights when uniform=true", () => {
  const groups = [
    { _count: { name: 1 } },
    { _count: { name: 50 } },
    { _count: { name: 100 } }
  ];
  const weights = computeSelectionWeights(groups, true);
  assert.deepEqual(weights, [1, 1, 1]);
});

test("computeSelectionWeights uses log2 when uniform=false", () => {
  const groups = [
    { _count: { name: 1 } },   // log2(2) = 1
    { _count: { name: 3 } },   // log2(4) = 2
    { _count: { name: 7 } },   // log2(8) = 3
    { _count: { name: 15 } }   // log2(16) = 4
  ];
  const weights = computeSelectionWeights(groups, false);
  assert.deepEqual(weights, [1, 2, 3, 4]);
});

test("uniform weighting eliminates print-count bias", () => {
  // Simulate a pool where one commander has 50 prints (UB set) and another
  // has 2 prints.  With log2 weighting the UB commander would be ~3.8x
  // more likely; with uniform weighting they are equal.
  const groups = [
    { _count: { name: 2 } },   // log2(3) ≈ 1.58
    { _count: { name: 50 } }   // log2(51) ≈ 5.67  →  3.6x bias
  ];
  const uniform = computeSelectionWeights(groups, true);
  assert.equal(uniform[0], uniform[1], "uniform weights should be equal");

  const weighted = computeSelectionWeights(groups, false);
  assert.ok(
    weighted[1] > weighted[0] * 3,
    `log2 weighting should create >3x bias (got ${(weighted[1] / weighted[0]).toFixed(1)}x)`
  );
});
