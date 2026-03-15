import test from "node:test";
import assert from "node:assert/strict";
import {
  parsePT,
  normalizeStat,
  countWords,
  calcHP,
  parseCMC,
  calcSpeedMs,
  parseAttackPattern,
  resolveAttackColor,
  typeMultiplier,
  effectivenessLabel,
  calcDamage,
  buildClashStats,
  isLegendaryCreature,
  critRateFromCondition,
  simulateBattle
} from "./clashService.js";

// ---------------------------------------------------------------------------
// parsePT
// ---------------------------------------------------------------------------

test("parsePT handles normal numbers", () => {
  assert.equal(parsePT("3"), 3);
  assert.equal(parsePT("0"), 0);
  assert.equal(parsePT("15"), 15);
});

test("parsePT returns 0 for star/variable/null", () => {
  assert.equal(parsePT("*"), 0);
  assert.equal(parsePT("X"), 0);
  assert.equal(parsePT(null), 0);
  assert.equal(parsePT(undefined), 0);
});

test("parsePT parses leading digits from mixed values", () => {
  // parseInt("1+*") = 1, which is the base power
  assert.equal(parsePT("1+*"), 1);
});

// ---------------------------------------------------------------------------
// normalizeStat
// ---------------------------------------------------------------------------

test("normalizeStat normalizes within range", () => {
  assert.equal(normalizeStat(0), 5);   // floor
  assert.equal(normalizeStat(15), 100); // ceiling
  assert.equal(normalizeStat(7), 47);
  assert.equal(normalizeStat(3), 20);
});

// ---------------------------------------------------------------------------
// countWords
// ---------------------------------------------------------------------------

test("countWords counts words in oracle text", () => {
  assert.equal(countWords("Flying, haste"), 2);
  assert.equal(countWords(null), 0);
  assert.equal(countWords(""), 0);
  assert.equal(countWords("When this creature enters the battlefield, draw a card."), 9);
});

test("countWords uses first face only for DFCs", () => {
  assert.equal(
    countWords("First side text here // Second side with more words and stuff"),
    4
  );
});

// ---------------------------------------------------------------------------
// calcHP
// ---------------------------------------------------------------------------

test("calcHP applies formula with min/max", () => {
  assert.equal(calcHP(0), 80);    // min floor
  assert.equal(calcHP(10), 80);   // 50 + 30 = 80
  assert.equal(calcHP(50), 200);  // 50 + 150
  assert.equal(calcHP(100), 350); // 50 + 300
  assert.equal(calcHP(200), 500); // capped at 500
});

// ---------------------------------------------------------------------------
// parseCMC
// ---------------------------------------------------------------------------

test("parseCMC counts mana symbols correctly", () => {
  assert.equal(parseCMC("{1}{B}{R}"), 3);    // 1 + 1 + 1
  assert.equal(parseCMC("{4}{B}{R}"), 6);    // 4 + 1 + 1
  assert.equal(parseCMC("{X}{R}"), 1);       // X=0, R=1
  assert.equal(parseCMC("{X}{X}{R}"), 1);    // X=0, X=0, R=1
  assert.equal(parseCMC(null), 0);
  assert.equal(parseCMC("{3}{B}{B}"), 5);
  assert.equal(parseCMC("{G/W}"), 1);        // hybrid = 1
  assert.equal(parseCMC("{U/P}"), 1);        // phyrexian = 1
  assert.equal(parseCMC("{2/U}"), 1);        // monocolored hybrid = 1
});

// ---------------------------------------------------------------------------
// calcSpeedMs
// ---------------------------------------------------------------------------

test("calcSpeedMs converts CMC to speed", () => {
  assert.equal(calcSpeedMs(0), 1500);
  assert.equal(calcSpeedMs(3), 2250);
  assert.equal(calcSpeedMs(7), 3250);
});

// ---------------------------------------------------------------------------
// parseAttackPattern
// ---------------------------------------------------------------------------

test("parseAttackPattern handles standard mana costs", () => {
  assert.deepEqual(parseAttackPattern("{1}{B}{R}"), ["C", "B", "R"]);
  assert.deepEqual(parseAttackPattern("{4}{B}{R}"), ["C", "B", "R"]);
  assert.deepEqual(parseAttackPattern("{3}{B}{B}"), ["C", "B", "B"]);
});

test("parseAttackPattern skips X", () => {
  assert.deepEqual(parseAttackPattern("{X}{R}"), ["R"]);
  assert.deepEqual(parseAttackPattern("{X}{X}{R}"), ["R"]);
});

test("parseAttackPattern handles hybrid mana", () => {
  assert.deepEqual(parseAttackPattern("{G/W}{G/W}"), ["G/W", "G/W"]);
});

test("parseAttackPattern handles phyrexian mana", () => {
  assert.deepEqual(parseAttackPattern("{U/P}"), ["U"]);
  assert.deepEqual(parseAttackPattern("{1}{U/P}{B}"), ["C", "U", "B"]);
});

test("parseAttackPattern handles monocolored hybrid", () => {
  assert.deepEqual(parseAttackPattern("{2/U}"), ["U"]);
  assert.deepEqual(parseAttackPattern("{2/U}{2/U}"), ["U", "U"]);
});

test("parseAttackPattern handles null/empty", () => {
  assert.deepEqual(parseAttackPattern(null), ["C"]);
  assert.deepEqual(parseAttackPattern(""), ["C"]);
});

test("parseAttackPattern handles only generic mana", () => {
  assert.deepEqual(parseAttackPattern("{5}"), ["C"]);
});

test("parseAttackPattern handles snow mana", () => {
  assert.deepEqual(parseAttackPattern("{S}{S}{U}"), ["C", "U"]);
});

// ---------------------------------------------------------------------------
// resolveAttackColor
// ---------------------------------------------------------------------------

test("resolveAttackColor returns single color directly", () => {
  assert.equal(resolveAttackColor("W"), "W");
  assert.equal(resolveAttackColor("C"), "C");
});

test("resolveAttackColor resolves hybrid randomly", () => {
  const results = new Set<string>();
  for (let i = 0; i < 100; i++) {
    results.add(resolveAttackColor("G/W"));
  }
  // With 100 rolls, we should see both colors
  assert.ok(results.has("G"));
  assert.ok(results.has("W"));
});

// ---------------------------------------------------------------------------
// typeMultiplier
// ---------------------------------------------------------------------------

test("typeMultiplier returns correct matchups", () => {
  assert.equal(typeMultiplier("W", ["B"]), 1.5);  // W > B
  assert.equal(typeMultiplier("W", ["R"]), 0.5);  // W < R
  assert.equal(typeMultiplier("W", ["U"]), 1.0);  // neutral
  assert.equal(typeMultiplier("C", ["B"]), 1.0);  // colorless always neutral
  assert.equal(typeMultiplier("W", []), 1.0);      // no defender colors
});

test("typeMultiplier averages for multi-colored defenders", () => {
  // W vs W,U: W→W = 1.0, W→U = 1.0 → avg = 1.0
  assert.equal(typeMultiplier("W", ["W", "U"]), 1.0);
  // R vs W,U: R→W = 1.5, R→U = 0.5 → avg = 1.0
  assert.equal(typeMultiplier("R", ["W", "U"]), 1.0);
  // W vs B,R: W→B = 1.5, W→R = 0.5 → avg = 1.0
  assert.equal(typeMultiplier("W", ["B", "R"]), 1.0);
});

// ---------------------------------------------------------------------------
// effectivenessLabel
// ---------------------------------------------------------------------------

test("effectivenessLabel categorizes correctly", () => {
  assert.equal(effectivenessLabel(1.5), "super");
  assert.equal(effectivenessLabel(0.5), "weak");
  assert.equal(effectivenessLabel(1.0), "neutral");
});

// ---------------------------------------------------------------------------
// critRateFromCondition
// ---------------------------------------------------------------------------

test("critRateFromCondition returns correct rates", () => {
  assert.equal(critRateFromCondition("poor"), 0.10);
  assert.equal(critRateFromCondition("good"), 0.20);
  assert.equal(critRateFromCondition("mint"), 0.30);
});

// ---------------------------------------------------------------------------
// isLegendaryCreature
// ---------------------------------------------------------------------------

test("isLegendaryCreature identifies legendary creatures", () => {
  assert.equal(isLegendaryCreature("Legendary Creature — Demon"), true);
  assert.equal(isLegendaryCreature("Legendary Creature — Human Wizard"), true);
  assert.equal(isLegendaryCreature("Creature — Elf"), false);  // not legendary
  assert.equal(isLegendaryCreature("Legendary Planeswalker — Jace"), false); // not creature
  assert.equal(isLegendaryCreature(null), false);
});

test("isLegendaryCreature uses first face for DFCs", () => {
  assert.equal(
    isLegendaryCreature("Legendary Creature — Vampire // Legendary Planeswalker — Sorin"),
    true
  );
  assert.equal(
    isLegendaryCreature("Legendary Enchantment // Legendary Creature — God"),
    false
  );
});

// ---------------------------------------------------------------------------
// buildClashStats
// ---------------------------------------------------------------------------

test("buildClashStats creates correct stats", () => {
  const card = {
    name: "Mayhem Devil",
    power: "3",
    toughness: "3",
    manaCost: "{1}{B}{R}",
    oracleText: "Whenever a player sacrifices a permanent, Mayhem Devil deals 1 damage to any target.",
    colors: "B,R",
    typeLine: "Creature — Devil"
  };
  const stats = buildClashStats(card, "good");

  assert.equal(stats.name, "Mayhem Devil");
  assert.equal(stats.attack, 20);  // 3/15 * 100 = 20
  assert.equal(stats.defense, 20);
  assert.equal(stats.hp, calcHP(countWords(card.oracleText)));
  assert.equal(stats.speedMs, 2250);  // CMC 3 = 1500 + 750
  assert.equal(stats.critRate, 0.20);
  assert.deepEqual(stats.attackPattern, ["C", "B", "R"]);
  assert.deepEqual(stats.colors, ["B", "R"]);
});

test("buildClashStats handles DFC names", () => {
  const card = {
    name: "Arlinn Kord // Arlinn, Embraced by the Moon",
    power: "4",
    toughness: "4",
    manaCost: "{2}{R}{G}",
    oracleText: "Some text here",
    colors: "R,G",
    typeLine: "Legendary Creature — Human Werewolf // Legendary Creature — Werewolf"
  };
  const stats = buildClashStats(card, "mint");
  assert.equal(stats.name, "Arlinn Kord");
  assert.equal(stats.critRate, 0.30);
});

// ---------------------------------------------------------------------------
// simulateBattle
// ---------------------------------------------------------------------------

test("simulateBattle produces a result with events", () => {
  const a = buildClashStats({
    name: "Creature A",
    power: "5",
    toughness: "5",
    manaCost: "{2}{R}",
    oracleText: "First strike. When this creature enters the battlefield, deal 3 damage to any target.",
    colors: "R",
    typeLine: "Legendary Creature — Warrior"
  }, "good");

  const b = buildClashStats({
    name: "Creature B",
    power: "3",
    toughness: "7",
    manaCost: "{1}{U}{U}",
    oracleText: "Flying. Whenever this creature deals combat damage to a player, draw a card.",
    colors: "U",
    typeLine: "Legendary Creature — Sphinx"
  }, "good");

  const result = simulateBattle(a, b);

  assert.ok(result.events.length > 0);
  assert.ok(result.events.length <= 100);
  assert.ok(result.winner === "Creature A" || result.winner === "Creature B");
  assert.ok(result.loser === "Creature A" || result.loser === "Creature B");
  assert.notEqual(result.winner, result.loser);
});

test("simulateBattle always terminates", () => {
  // Two 0-power creatures — should reach stalemate or chip damage wins
  const a = buildClashStats({
    name: "Wall A",
    power: "*",
    toughness: "5",
    manaCost: "{1}{W}",
    oracleText: "Defender.",
    colors: "W",
    typeLine: "Legendary Creature — Wall"
  }, "poor");

  const b = buildClashStats({
    name: "Wall B",
    power: "0",
    toughness: "5",
    manaCost: "{1}{B}",
    oracleText: "Defender.",
    colors: "B",
    typeLine: "Legendary Creature — Wall"
  }, "poor");

  const result = simulateBattle(a, b);
  assert.ok(result.events.length > 0);
  assert.ok(result.events.length <= 100);
});
