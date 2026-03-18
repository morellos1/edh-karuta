import { prisma } from "../db.js";
import {
  getCommanderCardNames,
  getCardByName,
  getRandomCardsByColorIdentity,
  type CardLookup
} from "../repositories/cardRepo.js";
import {
  buildClashStats,
  KEYWORD_WHITELIST,
  type ClashStats
} from "./clashService.js";

// ---------------------------------------------------------------------------
// EST Date Helpers
// ---------------------------------------------------------------------------

/** Current date as YYYY-MM-DD in America/New_York timezone. */
export function getEstDateString(): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return formatter.format(now); // "YYYY-MM-DD"
}

/** Simple deterministic hash of a date string to an index in [0, poolSize). */
function hashDateToIndex(dateStr: string, poolSize: number): number {
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = (hash * 31 + dateStr.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % poolSize;
}

// ---------------------------------------------------------------------------
// Daily Boss Selection
// ---------------------------------------------------------------------------

const KEYWORD_LIST = Array.from(KEYWORD_WHITELIST);

/** Extra ability for the boss — the bonus ability field name for display. */
export type DailyBossInfo = {
  card: CardLookup;
  stats: ClashStats;
  bonusAbility: string; // the extra ability added to the boss
};

/**
 * Get today's daily raid boss. Deterministic: same boss for all servers
 * on the same EST date.
 */
export async function getDailyBoss(): Promise<DailyBossInfo> {
  const dateStr = getEstDateString();
  const names = await getCommanderCardNames();
  if (names.length === 0) {
    throw new Error("No commander-eligible cards in pool for daily raid.");
  }

  const bossIndex = hashDateToIndex(dateStr, names.length);
  const bossName = names[bossIndex];
  const card = await getCardByName(bossName);
  if (!card) {
    throw new Error(`Daily raid boss card not found: ${bossName}`);
  }

  // Build stats with max bonuses
  const maxBonuses = {
    bonusAttack: 200,
    bonusDefense: 200,
    bonusHp: 200,
    bonusSpeed: 50,
    bonusCritRate: 50
  };

  const stats = buildClashStats(card, "mint", maxBonuses);

  // Detect innate abilities that parseKeywordAbilities may have missed
  // (e.g., keywords on lines with periods from reminder text).
  const existingAbilities = new Set(stats.abilities);
  const oracleLower = (card.oracleText || "").toLowerCase();
  for (const keyword of KEYWORD_LIST) {
    if (!existingAbilities.has(keyword) && new RegExp(`\\b${keyword}\\b`).test(oracleLower)) {
      stats.abilities.push(keyword);
      existingAbilities.add(keyword);
      applyAbilityBonus(stats, keyword);
    }
  }

  // Pick 1 additional ability the boss doesn't already have.
  const availableAbilities = KEYWORD_LIST.filter(
    (a) => !existingAbilities.has(a)
  );

  let bonusAbility = "";
  if (availableAbilities.length > 0) {
    const abilityIndex = hashDateToIndex(dateStr + ":ability", availableAbilities.length);
    bonusAbility = availableAbilities[abilityIndex];
    stats.abilities.push(bonusAbility);

    // Apply the bonus ability's stat multiplier
    applyAbilityBonus(stats, bonusAbility);
  }

  return { card, stats, bonusAbility };
}

/** Apply a single ability's stat multiplier to existing stats. */
function applyAbilityBonus(stats: ClashStats, ability: string): void {
  switch (ability) {
    case "trample":
    case "flying":
      stats.attack = Math.round(stats.attack * 1.20);
      break;
    case "defender":
      stats.defense = Math.round(stats.defense * 1.25);
      break;
    case "hexproof":
    case "reach":
      stats.defense = Math.round(stats.defense * 1.20);
      break;
    case "haste":
    case "flash":
    case "vigilance":
      stats.speed = Math.round(stats.speed * 1.25);
      break;
    // deathtouch, double strike, first strike, indestructible, lifelink: combat effects only
  }
}

// ---------------------------------------------------------------------------
// Daily Reward Tracking
// ---------------------------------------------------------------------------

export async function hasClaimedDailyReward(userId: string): Promise<boolean> {
  const dateStr = getEstDateString();
  const record = await prisma.dailyRaidReward.findUnique({
    where: { userId_dateStr: { userId, dateStr } }
  });
  return record !== null;
}

export async function markDailyRewardClaimed(userId: string): Promise<void> {
  const dateStr = getEstDateString();
  await prisma.dailyRaidReward.upsert({
    where: { userId_dateStr: { userId, dateStr } },
    update: {},
    create: { userId, dateStr }
  });
}

// ---------------------------------------------------------------------------
// Reward Card Selection
// ---------------------------------------------------------------------------

/**
 * Pick 3 random droppable cards that share a color identity with the boss.
 */
export async function getRewardCards(bossCard: CardLookup): Promise<CardLookup[]> {
  return getRandomCardsByColorIdentity(3, bossCard.colorIdentity);
}
