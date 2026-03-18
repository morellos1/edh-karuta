import test from "node:test";
import assert from "node:assert/strict";
import {
  parsePT,
  normalizeStat,
  countWords,
  calcHP,
  parseCMC,
  calcSpeedMs,
  calcSpeed,
  speedToMs,
  parseAttackPattern,
  resolveAttackColor,
  typeMultiplier,
  effectivenessLabel,
  calcDamage,
  buildClashStats,
  isLegendaryCreature,
  critRateFromCondition,
  simulateBattle,
  parseKeywordAbilities
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
  assert.equal(normalizeStat(0), 50);    // floor
  assert.equal(normalizeStat(15), 1000); // ceiling
  assert.equal(normalizeStat(7), 467);
  assert.equal(normalizeStat(3), 200);
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
  assert.equal(calcHP(0), 1300);   // min floor
  assert.equal(calcHP(10), 1300);  // 1000 + 300 = 1300, at floor
  assert.equal(calcHP(50), 2500);  // 1000 + 1500
  assert.equal(calcHP(100), 4000); // 1000 + 3000
  assert.equal(calcHP(200), 5500); // capped at 5500
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
// calcSpeed
// ---------------------------------------------------------------------------

test("calcSpeed converts CMC to normalized speed stat", () => {
  assert.equal(calcSpeed(0), 100);  // CMC 0 = max speed
  assert.equal(calcSpeed(3), 76);   // 100 - 24
  assert.equal(calcSpeed(5), 60);   // 100 - 40
  assert.equal(calcSpeed(8), 36);   // 100 - 64
  assert.equal(calcSpeed(12), 10);  // floors at 10
  assert.equal(calcSpeed(16), 10);  // floors at 10
});

// ---------------------------------------------------------------------------
// speedToMs
// ---------------------------------------------------------------------------

test("speedToMs uses hyperbolic curve for meaningful separation", () => {
  // High speed → fast attacks
  assert.equal(speedToMs(100), Math.round(150000 / 130)); // ~1154ms
  // Medium speed
  assert.equal(speedToMs(50), Math.round(150000 / 80));   // ~1875ms
  // Low speed → slow attacks
  assert.equal(speedToMs(5), Math.round(150000 / 35));    // ~4286ms
});

test("speedToMs creates meaningful ratio between fast and slow", () => {
  const fast = speedToMs(75);  // ~1429ms
  const slow = speedToMs(26);  // ~2679ms
  const ratio = slow / fast;
  // Fast commander should attack nearly twice as often as a slow one
  assert.ok(ratio > 1.7, `Expected ratio > 1.7, got ${ratio}`);
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

test("isLegendaryCreature rejects meld result cards", () => {
  assert.equal(
    isLegendaryCreature("Legendary Creature — Phyrexian Dragon Angel", { isMeldResult: true }),
    false
  );
  assert.equal(
    isLegendaryCreature("Legendary Creature — Demon", { isMeldResult: false }),
    true
  );
});

// ---------------------------------------------------------------------------
// buildClashStats
// ---------------------------------------------------------------------------

test("buildClashStats creates correct base stats without bonuses", () => {
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
  assert.equal(stats.attack, 200);  // 3/15 * 1000 = 200
  assert.equal(stats.defense, 200);
  assert.equal(stats.hp, calcHP(countWords(card.oracleText)) + 500);
  assert.equal(stats.speed, 76);   // CMC 3: 100 - 3*8 = 76
  assert.equal(stats.speedMs, speedToMs(76));  // derived from final speed stat
  assert.equal(stats.critRate, 0.20); // base crit rate for all
  assert.deepEqual(stats.attackPattern, ["C", "B", "R"]);
  assert.deepEqual(stats.colors, ["B", "R"]);
  // Base stats equal final stats when no bonuses
  assert.equal(stats.baseAttack, stats.attack);
  assert.equal(stats.baseDefense, stats.defense);
  assert.equal(stats.baseHp, stats.hp);
  assert.equal(stats.baseSpeed, stats.speed);
  assert.equal(stats.baseCritRate, 0.20);
});

test("buildClashStats applies bonuses correctly", () => {
  const card = {
    name: "Mayhem Devil",
    power: "3",
    toughness: "3",
    manaCost: "{1}{B}{R}",
    oracleText: "Whenever a player sacrifices a permanent, Mayhem Devil deals 1 damage to any target.",
    colors: "B,R",
    typeLine: "Creature — Devil"
  };
  const bonuses = {
    bonusAttack: 150,  // flat +150 → 200 + 150 = 350
    bonusDefense: 100, // flat +100 → 200 + 100 = 300
    bonusHp: 200,      // flat +200
    bonusSpeed: 20,    // +20% of base speed (still percentage)
    bonusCritRate: 50  // +50% of base 0.20 = +0.10 → 0.30
  };
  const stats = buildClashStats(card, "good", bonuses);

  assert.equal(stats.baseAttack, 200);
  assert.equal(stats.attack, 350);   // 200 + 150
  assert.equal(stats.baseDefense, 200);
  assert.equal(stats.defense, 300);  // 200 + 100
  assert.equal(stats.hp, stats.baseHp + 200);
  assert.ok(stats.speed > stats.baseSpeed);
  assert.equal(stats.critRate, 0.30); // 0.20 + round(0.20 * 50) / 100 = 0.20 + 0.10
});

test("buildClashStats handles null bonuses same as no bonuses", () => {
  const card = {
    name: "Test",
    power: "5",
    toughness: "5",
    manaCost: "{2}{R}",
    oracleText: "Some text",
    colors: "R",
    typeLine: "Creature — Warrior"
  };
  const statsNone = buildClashStats(card, "good");
  const statsNull = buildClashStats(card, "good", null);
  const statsEmpty = buildClashStats(card, "good", {
    bonusAttack: null,
    bonusDefense: null,
    bonusHp: null,
    bonusSpeed: null,
    bonusCritRate: null
  });

  assert.equal(statsNone.attack, statsNull.attack);
  assert.equal(statsNone.attack, statsEmpty.attack);
  assert.equal(statsNone.critRate, statsNull.critRate);
  assert.equal(statsNone.critRate, statsEmpty.critRate);
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
  assert.equal(stats.critRate, 0.20); // base crit is 20% without bonuses
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

// ---------------------------------------------------------------------------
// parseKeywordAbilities
// ---------------------------------------------------------------------------

test("parseKeywordAbilities detects standalone keywords", () => {
  assert.deepEqual(parseKeywordAbilities("Flying"), ["flying"]);
  assert.deepEqual(parseKeywordAbilities("Flying, trample"), ["flying", "trample"]);
  assert.deepEqual(parseKeywordAbilities("Flash"), ["flash"]);
  assert.deepEqual(parseKeywordAbilities("Hexproof"), ["hexproof"]);
});

test("parseKeywordAbilities ignores keywords in sentences", () => {
  const text = "When this creature enters the battlefield, it gains flying until end of turn.";
  assert.deepEqual(parseKeywordAbilities(text), []);
});

test("parseKeywordAbilities detects multi-line keywords", () => {
  const text = "Flying, indestructible\nWhen this creature enters the battlefield, draw a card.";
  const abilities = parseKeywordAbilities(text);
  assert.ok(abilities.includes("flying"));
  assert.ok(abilities.includes("indestructible"));
});

// ---------------------------------------------------------------------------
// Keyword stat bonuses
// ---------------------------------------------------------------------------

test("buildClashStats applies flash speed bonus (+25%)", () => {
  const card = {
    name: "Flash Creature",
    power: "3",
    toughness: "3",
    manaCost: "{1}{U}{U}",
    oracleText: "Flash",
    colors: "U",
    typeLine: "Legendary Creature — Wizard"
  };
  const stats = buildClashStats(card, "good");
  const expectedSpeed = Math.round(stats.baseSpeed * 1.25);
  assert.equal(stats.speed, expectedSpeed);
});

test("buildClashStats applies hexproof defense bonus (+20%)", () => {
  const card = {
    name: "Hexproof Creature",
    power: "3",
    toughness: "5",
    manaCost: "{2}{G}",
    oracleText: "Hexproof",
    colors: "G",
    typeLine: "Legendary Creature — Troll"
  };
  const stats = buildClashStats(card, "good");
  const expectedDef = Math.round(stats.baseDefense * 1.20);
  assert.equal(stats.defense, expectedDef);
});

test("buildClashStats applies trample/flying attack bonus (+20%)", () => {
  const card = {
    name: "Flying Trampler",
    power: "5",
    toughness: "5",
    manaCost: "{3}{R}{G}",
    oracleText: "Flying, trample",
    colors: "R,G",
    typeLine: "Legendary Creature — Dragon"
  };
  const stats = buildClashStats(card, "good");
  // Both flying and trample: 1.0 + 0.20 + 0.20 = 1.40
  const expectedAtk = Math.round(stats.baseAttack * 1.40);
  assert.equal(stats.attack, expectedAtk);
});

test("buildClashStats gives indestructible no stat bonus", () => {
  const card = {
    name: "Indestructible Creature",
    power: "4",
    toughness: "4",
    manaCost: "{2}{W}{W}",
    oracleText: "Indestructible",
    colors: "W",
    typeLine: "Legendary Creature — God"
  };
  const stats = buildClashStats(card, "good");
  // No defense multiplier from indestructible
  assert.equal(stats.attack, stats.baseAttack);
  assert.equal(stats.defense, stats.baseDefense);
  assert.equal(stats.speed, stats.baseSpeed);
});

// ---------------------------------------------------------------------------
// Indestructible combat mechanic
// ---------------------------------------------------------------------------

test("indestructible survives first lethal hit at 1 HP", () => {
  // High-power attacker vs indestructible defender with low HP
  const attacker = buildClashStats({
    name: "Attacker",
    power: "15",
    toughness: "15",
    manaCost: "{5}{R}{R}",
    oracleText: "When this creature enters the battlefield, it deals 5 damage to any target.",
    colors: "R",
    typeLine: "Legendary Creature — Dragon"
  }, "good");

  const defender = buildClashStats({
    name: "Defender",
    power: "1",
    toughness: "1",
    manaCost: "{W}",
    oracleText: "Indestructible",
    colors: "W",
    typeLine: "Legendary Creature — God"
  }, "good");

  // Run many trials — indestructible should trigger at least once
  let indestructibleTriggered = false;
  for (let i = 0; i < 20; i++) {
    const result = simulateBattle(attacker, defender);
    const indestructEvent = result.events.find((e) => e.isIndestructible);
    if (indestructEvent) {
      indestructibleTriggered = true;
      assert.equal(indestructEvent.defenderHpRemaining, 1);
      break;
    }
  }
  assert.ok(indestructibleTriggered, "Indestructible should trigger when defender takes lethal damage");
});

test("indestructible only triggers once per clash", () => {
  const attacker = buildClashStats({
    name: "Attacker",
    power: "15",
    toughness: "15",
    manaCost: "{5}{R}{R}",
    oracleText: "When this creature enters the battlefield, it deals 5 damage to any target.",
    colors: "R",
    typeLine: "Legendary Creature — Dragon"
  }, "good");

  const defender = buildClashStats({
    name: "Defender",
    power: "1",
    toughness: "1",
    manaCost: "{W}",
    oracleText: "Indestructible",
    colors: "W",
    typeLine: "Legendary Creature — God"
  }, "good");

  // The defender should eventually die (indestructible only saves once)
  let defenderDied = false;
  for (let i = 0; i < 20; i++) {
    const result = simulateBattle(attacker, defender);
    if (result.loser === "Defender") {
      defenderDied = true;
      // Count indestructible triggers
      const indestructCount = result.events.filter((e) => e.isIndestructible).length;
      // Should trigger at most once (main hit), or twice if double strike shows it on both events
      assert.ok(indestructCount <= 2, `Indestructible triggered too many times: ${indestructCount}`);
      break;
    }
  }
  assert.ok(defenderDied, "Defender should eventually die since indestructible only works once");
});

test("indestructible blocks deathtouch execution", () => {
  const attacker = buildClashStats({
    name: "Deathtouch Attacker",
    power: "10",
    toughness: "5",
    manaCost: "{3}{B}{B}",
    oracleText: "Deathtouch\nWhen this creature enters the battlefield, each opponent loses 3 life.",
    colors: "B",
    typeLine: "Legendary Creature — Demon"
  }, "good");

  const defender = buildClashStats({
    name: "Indestructible Defender",
    power: "1",
    toughness: "1",
    manaCost: "{W}",
    oracleText: "Indestructible",
    colors: "W",
    typeLine: "Legendary Creature — God"
  }, "good");

  // Run trials — when indestructible fires, deathtouch should not kill
  let tested = false;
  for (let i = 0; i < 50; i++) {
    const result = simulateBattle(attacker, defender);
    const indestructEvent = result.events.find((e) => e.isIndestructible);
    if (indestructEvent) {
      tested = true;
      assert.equal(indestructEvent.defenderHpRemaining, 1);
      assert.equal(indestructEvent.isDeathtouch, undefined);
      break;
    }
  }
  assert.ok(tested, "Should have found an indestructible trigger event");
});
