// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ClashStats = {
  name: string;
  attack: number;
  defense: number;
  hp: number;
  speed: number;     // normalized 0-100 (higher = faster)
  speedMs: number;   // internal: ms between attacks
  cmc: number;
  critRate: number;
  attackPattern: string[]; // "W"|"U"|"B"|"R"|"G"|"C"|"G/W" etc.
  colors: string[];        // defender colors for effectiveness calc
  baseAttack: number;
  baseDefense: number;
  baseHp: number;
  baseSpeed: number;
  baseCritRate: number;    // decimal, always 0.20
};

export type BattleEvent = {
  attacker: string;
  defender: string;
  attackColor: string; // resolved single color: "W"|"U"|"B"|"R"|"G"|"C"
  damage: number;
  effectiveness: "super" | "weak" | "neutral";
  isCrit: boolean;
  defenderHpRemaining: number;
  attackerHpRemaining: number;
};

export type BattleResult = {
  events: BattleEvent[];
  winner: string;
  loser: string;
  winnerHp: number;
  loserHp: number;
  isDraw: boolean;
};

// ---------------------------------------------------------------------------
// Type Effectiveness Wheel: W > B > G > U > R > W
// ---------------------------------------------------------------------------

const STRONG_AGAINST: Record<string, string> = {
  W: "B",
  B: "G",
  G: "U",
  U: "R",
  R: "W"
};

const WEAK_AGAINST: Record<string, string> = {
  W: "R",
  B: "W",
  G: "B",
  U: "G",
  R: "U"
};

/**
 * Get type effectiveness multiplier for a single attack color vs a single
 * defender color. Colorless always returns 1.0.
 */
function singleTypeMultiplier(attackColor: string, defenderColor: string): number {
  if (attackColor === "C" || defenderColor === "C") return 1.0;
  if (STRONG_AGAINST[attackColor] === defenderColor) return 1.5;
  if (WEAK_AGAINST[attackColor] === defenderColor) return 0.5;
  return 1.0;
}

/**
 * Average effectiveness of a single attack color across all defender colors.
 * If defender has no colors, returns 1.0.
 */
export function typeMultiplier(attackColor: string, defenderColors: string[]): number {
  if (attackColor === "C" || defenderColors.length === 0) return 1.0;
  const sum = defenderColors.reduce((acc, dc) => acc + singleTypeMultiplier(attackColor, dc), 0);
  return sum / defenderColors.length;
}

export function effectivenessLabel(mult: number): "super" | "weak" | "neutral" {
  if (mult > 1.0) return "super";
  if (mult < 1.0) return "weak";
  return "neutral";
}

// ---------------------------------------------------------------------------
// Stat Parsing & Normalization
// ---------------------------------------------------------------------------

const MAX_PT = 15;

/** Parse power/toughness string. Returns 0 for *, X, or non-numeric. */
export function parsePT(value: string | null | undefined): number {
  if (!value) return 0;
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Normalize a power/toughness value (0-15) to a 50-1000 stat. */
export function normalizeStat(raw: number): number {
  return Math.max(50, Math.min(1000, Math.round((raw / MAX_PT) * 1000)));
}

/** Count words in oracle text. Uses first face only (split on " // "). */
export function countWords(oracleText: string | null | undefined): number {
  if (!oracleText) return 0;
  const firstFace = oracleText.split(" // ")[0];
  const words = firstFace.trim().split(/\s+/).filter(Boolean);
  return words.length;
}

/** Oracle text word count → HP. Min 1300, max 5500. */
export function calcHP(wordCount: number): number {
  return Math.min(5500, Math.max(1300, 1000 + wordCount * 30));
}

/** Crit rate based on card condition. */
export function critRateFromCondition(condition: string): number {
  switch (condition.toLowerCase()) {
    case "poor": return 0.10;
    case "mint": return 0.30;
    default: return 0.20; // "good" or unknown
  }
}

// ---------------------------------------------------------------------------
// Mana Cost Parsing
// ---------------------------------------------------------------------------

/**
 * Parse CMC from a mana cost string. Each {…} symbol counts as its numeric
 * value for generic, 1 for colored/hybrid/phyrexian, 0 for {X}.
 */
export function parseCMC(manaCost: string | null | undefined): number {
  if (!manaCost) return 0;
  let cmc = 0;
  for (const match of manaCost.matchAll(/\{([^}]+)\}/g)) {
    const token = match[1].toUpperCase();
    if (token === "X") continue;
    // Hybrid/phyrexian (contains "/") always counts as 1
    if (token.includes("/")) {
      cmc += 1;
      continue;
    }
    const num = parseInt(token, 10);
    if (/^\d+$/.test(token) && Number.isFinite(num)) {
      cmc += num;
    } else {
      // Colored, snow — each counts as 1
      cmc += 1;
    }
  }
  return cmc;
}

/** CMC → speed in milliseconds between attacks (legacy, used only for display timing). */
export function calcSpeedMs(cmc: number): number {
  return 1500 + cmc * 250;
}

/** CMC → normalized speed stat (0-100, higher = faster). */
export function calcSpeed(cmc: number): number {
  return Math.max(5, Math.min(100, 100 - cmc * 8));
}

/**
 * Convert final speed stat (after bonuses) to ms between attacks.
 * Uses a hyperbolic curve so high-speed commanders attack meaningfully
 * faster than slow ones, and speed bonuses actually affect combat.
 *
 *   speed 100 → ~1154 ms   speed 50 → ~1875 ms
 *   speed  75 → ~1429 ms   speed 25 → ~2727 ms
 *   speed   5 → ~4286 ms
 */
export function speedToMs(speed: number): number {
  return Math.round(150000 / (30 + speed));
}

/**
 * Parse the attack pattern from a mana cost string.
 * Returns an ordered array of color codes to cycle through.
 *
 * Rules:
 * - Generic numbers ({1}, {4}) → at most one "C" total
 * - {X} → skip
 * - {W},{U},{B},{R},{G} → that color
 * - Hybrid {G/W} → "G/W" (resolved randomly at attack time)
 * - Phyrexian {U/P} → "U" (the color)
 * - Monocolored hybrid {2/U} → "U" (the color)
 * - Snow {S} → contributes to generic (one "C")
 */
export function parseAttackPattern(manaCost: string | null | undefined): string[] {
  if (!manaCost) return ["C"];

  const pattern: string[] = [];
  let hasGeneric = false;
  const COLOR_SET = new Set(["W", "U", "B", "R", "G"]);

  for (const match of manaCost.matchAll(/\{([^}]+)\}/g)) {
    const token = match[1].toUpperCase();

    if (token === "X") {
      continue;
    }

    // Pure generic number like {1}, {4}
    if (/^\d+$/.test(token)) {
      if (!hasGeneric) {
        hasGeneric = true;
        pattern.push("C");
      }
      continue;
    }

    // Snow mana {S}
    if (token === "S") {
      if (!hasGeneric) {
        hasGeneric = true;
        pattern.push("C");
      }
      continue;
    }

    // Single color {W}, {U}, {B}, {R}, {G}
    if (COLOR_SET.has(token)) {
      pattern.push(token);
      continue;
    }

    // Hybrid / Phyrexian — contains "/"
    if (token.includes("/")) {
      const parts = token.split("/");

      // Phyrexian mana: {U/P} → default to the color
      if (parts[1] === "P") {
        if (COLOR_SET.has(parts[0])) {
          pattern.push(parts[0]);
        } else {
          // Edge case: {P} alone — treat as generic
          if (!hasGeneric) {
            hasGeneric = true;
            pattern.push("C");
          }
        }
        continue;
      }

      // Monocolored hybrid: {2/U} → default to color
      if (/^\d+$/.test(parts[0]) && COLOR_SET.has(parts[1])) {
        pattern.push(parts[1]);
        continue;
      }
      if (COLOR_SET.has(parts[0]) && /^\d+$/.test(parts[1])) {
        pattern.push(parts[0]);
        continue;
      }

      // True hybrid: {G/W} → keep as "G/W" (resolved at attack time)
      if (COLOR_SET.has(parts[0]) && COLOR_SET.has(parts[1])) {
        pattern.push(`${parts[0]}/${parts[1]}`);
        continue;
      }

      // Unknown hybrid — treat as generic
      if (!hasGeneric) {
        hasGeneric = true;
        pattern.push("C");
      }
      continue;
    }

    // Unknown token — treat as generic
    if (!hasGeneric) {
      hasGeneric = true;
      pattern.push("C");
    }
  }

  return pattern.length > 0 ? pattern : ["C"];
}

/** Resolve a pattern entry to a concrete color at attack time. */
export function resolveAttackColor(patternEntry: string): string {
  if (patternEntry.includes("/")) {
    const parts = patternEntry.split("/");
    return Math.random() < 0.5 ? parts[0] : parts[1];
  }
  return patternEntry;
}

/** Extract defender colors from the card's colors string (comma-separated). */
export function parseDefenderColors(colors: string | null | undefined): string[] {
  if (!colors) return [];
  return colors
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Build ClashStats from card data
// ---------------------------------------------------------------------------

export type CardDataForClash = {
  name: string;
  power: string | null;
  toughness: string | null;
  manaCost: string | null;
  oracleText: string | null;
  colors: string | null;
  typeLine: string | null;
};

export type ClashBonusFields = {
  bonusAttack?: number | null;
  bonusDefense?: number | null;
  bonusHp?: number | null;
  bonusSpeed?: number | null;
  bonusCritRate?: number | null;
};

/** Apply a percentage-based bonus (for speed and crit rate). */
function applyPctBonus(base: number, bonusPercent: number | null | undefined): number {
  if (!bonusPercent) return base;
  return Math.round(base * (1 + bonusPercent / 100));
}

/** Apply a flat additive bonus (for atk, def, hp). */
function applyFlatBonus(base: number, bonus: number | null | undefined): number {
  if (!bonus) return base;
  return base + bonus;
}

export function buildClashStats(
  card: CardDataForClash,
  condition: string,
  bonuses?: ClashBonusFields | null
): ClashStats {
  // Use first face name for DFCs
  const name = card.name.split(" // ")[0];
  const power = parsePT(card.power);
  const toughness = parsePT(card.toughness);
  const cmc = parseCMC(card.manaCost);
  const wordCount = countWords(card.oracleText);

  const baseAttack = normalizeStat(power);
  const baseDefense = normalizeStat(toughness);
  const baseHp = calcHP(wordCount);
  const baseSpeed = calcSpeed(cmc);
  const baseCritRate = 0.20;

  const attack = applyFlatBonus(baseAttack, bonuses?.bonusAttack);
  const defense = applyFlatBonus(baseDefense, bonuses?.bonusDefense);
  const hp = applyFlatBonus(baseHp, bonuses?.bonusHp);
  const speed = applyPctBonus(baseSpeed, bonuses?.bonusSpeed);
  // Crit bonus: bonusCritRate is 5-50, representing a percentage of the base 20%.
  // E.g., bonusCritRate=50 → 50% of 0.20 = 0.10 → final 0.30
  // Use integer math to avoid floating point issues.
  const baseCritPct = 20; // base crit as integer percentage
  const critBonusPct = bonuses?.bonusCritRate
    ? Math.round(baseCritPct * bonuses.bonusCritRate / 100)
    : 0;
  const critRate = (baseCritPct + critBonusPct) / 100;

  return {
    name,
    attack,
    defense,
    hp,
    speed,
    speedMs: speedToMs(speed),
    cmc,
    critRate,
    attackPattern: parseAttackPattern(card.manaCost),
    colors: parseDefenderColors(card.colors),
    baseAttack,
    baseDefense,
    baseHp,
    baseSpeed,
    baseCritRate,
  };
}

// ---------------------------------------------------------------------------
// Damage Calculation
// ---------------------------------------------------------------------------

export function calcDamage(
  attackerAttack: number,
  defenderDefense: number,
  attackColor: string,
  defenderColors: string[],
  critRate: number
): { damage: number; effectiveness: "super" | "weak" | "neutral"; isCrit: boolean } {
  const baseDamage = 100 + attackerAttack * 0.8;
  const defenseFactor = 1 - defenderDefense / 2000;
  const typeMult = typeMultiplier(attackColor, defenderColors);
  const isCrit = Math.random() < critRate;
  const critMult = isCrit ? 1.5 : 1.0;
  const damage = Math.max(1, Math.round(baseDamage * defenseFactor * typeMult * critMult));
  return { damage, effectiveness: effectivenessLabel(typeMult), isCrit };
}

// ---------------------------------------------------------------------------
// Battle Simulation
// ---------------------------------------------------------------------------

export function simulateBattle(a: ClashStats, b: ClashStats, maxAttacks = 100): BattleResult {

  let hpA = a.hp;
  let hpB = b.hp;
  let nextA = a.speedMs;
  let nextB = b.speedMs;
  let patternIdxA = 0;
  let patternIdxB = 0;

  const events: BattleEvent[] = [];

  while (hpA > 0 && hpB > 0 && events.length < maxAttacks) {
    // Determine who attacks next
    let attackerIsA: boolean;
    if (nextA < nextB) {
      attackerIsA = true;
    } else if (nextB < nextA) {
      attackerIsA = false;
    } else {
      // Tie-break: lower CMC first, then alphabetical
      if (a.cmc !== b.cmc) {
        attackerIsA = a.cmc < b.cmc;
      } else {
        attackerIsA = a.name <= b.name;
      }
    }

    if (attackerIsA) {
      const rawColor = a.attackPattern[patternIdxA % a.attackPattern.length];
      const attackColor = resolveAttackColor(rawColor);
      patternIdxA++;
      const { damage, effectiveness, isCrit } = calcDamage(
        a.attack, b.defense, attackColor, b.colors, a.critRate
      );
      hpB = Math.max(0, hpB - damage);
      nextA += a.speedMs;
      events.push({
        attacker: a.name,
        defender: b.name,
        attackColor,
        damage,
        effectiveness,
        isCrit,
        defenderHpRemaining: hpB,
        attackerHpRemaining: hpA
      });
    } else {
      const rawColor = b.attackPattern[patternIdxB % b.attackPattern.length];
      const attackColor = resolveAttackColor(rawColor);
      patternIdxB++;
      const { damage, effectiveness, isCrit } = calcDamage(
        b.attack, a.defense, attackColor, a.colors, b.critRate
      );
      hpA = Math.max(0, hpA - damage);
      nextB += b.speedMs;
      events.push({
        attacker: b.name,
        defender: a.name,
        attackColor,
        damage,
        effectiveness,
        isCrit,
        defenderHpRemaining: hpA,
        attackerHpRemaining: hpB
      });
    }
  }

  // Determine winner
  let winner: string;
  let loser: string;
  let winnerHp: number;
  let loserHp: number;
  let isDraw = false;

  if (hpA <= 0 && hpB <= 0) {
    // Both dead — attacker of the killing blow wins
    const lastEvent = events[events.length - 1];
    winner = lastEvent.attacker;
    loser = lastEvent.defender;
    winnerHp = lastEvent.attackerHpRemaining;
    loserHp = 0;
  } else if (hpA <= 0) {
    winner = b.name;
    loser = a.name;
    winnerHp = hpB;
    loserHp = 0;
  } else if (hpB <= 0) {
    winner = a.name;
    loser = b.name;
    winnerHp = hpA;
    loserHp = 0;
  } else {
    // Stalemate — higher HP% wins
    const pctA = hpA / a.hp;
    const pctB = hpB / b.hp;
    if (pctA > pctB) {
      winner = a.name;
      loser = b.name;
      winnerHp = hpA;
      loserHp = hpB;
    } else if (pctB > pctA) {
      winner = b.name;
      loser = a.name;
      winnerHp = hpB;
      loserHp = hpA;
    } else {
      // True tie — challenger (a) wins
      winner = a.name;
      loser = b.name;
      winnerHp = hpA;
      loserHp = hpB;
      isDraw = true;
    }
  }

  return { events, winner, loser, winnerHp, loserHp, isDraw };
}

// ---------------------------------------------------------------------------
// Validation Helpers
// ---------------------------------------------------------------------------

/** Check if a card's type line makes it a legendary creature (not planeswalker).
 *  Meld result cards are excluded — they cannot be played individually. */
export function isLegendaryCreature(
  typeLine: string | null | undefined,
  options?: { isMeldResult?: boolean }
): boolean {
  if (!typeLine) return false;
  if (options?.isMeldResult) return false;
  const first = typeLine.split(" // ")[0];
  return first.includes("Legendary") && first.includes("Creature");
}
