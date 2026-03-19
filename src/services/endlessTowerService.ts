import { prisma } from "../db.js";
import {
  getRandomCreatureCard,
  getRandomCardsByColorIdentity,
  type CardLookup
} from "../repositories/cardRepo.js";
import {
  buildClashStats,
  KEYWORD_WHITELIST,
  type ClashStats
} from "./clashService.js";
import { addGold } from "../repositories/inventoryRepo.js";
import { pickRandomCondition } from "./conditionService.js";
import { rollClashBonuses } from "./clashBonusService.js";
import { isCommanderEligible } from "./clashService.js";
import { generateDisplayId } from "../utils/displayId.js";

// ---------------------------------------------------------------------------
// Boss Generation
// ---------------------------------------------------------------------------

const KEYWORD_LIST = Array.from(KEYWORD_WHITELIST);

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

export type FloorBossInfo = {
  card: CardLookup;
  stats: ClashStats;
  floor: number;
  bonusAbilities: string[];
};

/**
 * Generate a random boss for an Endless Tower floor.
 *
 * Scaling: floor 10 matches daily boss difficulty.
 * - Uses same max bonuses as daily boss (200 atk/def/hp, 50 spd/crit)
 * - Uses same +50% HP boost
 * - Applies scaling factor: 0.69 * (1 + (floor-1) * 0.05)
 *   Floor 1: 0.69×, Floor 10: 1.00×, Floor 20: 1.66×
 * - Every 5 floors: +1 bonus keyword ability
 */
export async function generateFloorBoss(floor: number): Promise<FloorBossInfo> {
  const card = await getRandomCreatureCard();

  // Build stats with max bonuses (same as daily boss)
  const maxBonuses = {
    bonusAttack: 200,
    bonusDefense: 200,
    bonusHp: 200,
    bonusSpeed: 50,
    bonusCritRate: 50
  };

  const stats = buildClashStats(card, "mint", maxBonuses);

  // Detect innate abilities that parseKeywordAbilities may have missed
  const existingAbilities = new Set(stats.abilities);
  const oracleLower = (card.oracleText || "").toLowerCase();
  for (const keyword of KEYWORD_LIST) {
    if (!existingAbilities.has(keyword) && new RegExp(`\\b${keyword}\\b`).test(oracleLower)) {
      stats.abilities.push(keyword);
      existingAbilities.add(keyword);
      applyAbilityBonus(stats, keyword);
    }
  }

  // Add bonus abilities: 1 per every 5 floors
  const numBonusAbilities = Math.floor(floor / 5);
  const availableAbilities = KEYWORD_LIST.filter(
    (a) => !existingAbilities.has(a)
  );

  const bonusAbilities: string[] = [];
  for (let i = 0; i < numBonusAbilities && availableAbilities.length > 0; i++) {
    const idx = Math.floor(Math.random() * availableAbilities.length);
    const ability = availableAbilities.splice(idx, 1)[0];
    bonusAbilities.push(ability);
    stats.abilities.push(ability);
    applyAbilityBonus(stats, ability);
  }

  // Apply +50% HP boost (same as daily boss)
  const hpBoost = Math.round(stats.baseHp * 0.5);
  stats.hp += hpBoost;
  stats.baseHp += hpBoost;

  // Apply floor scaling factor
  // At floor 10, scaleFactor = 0.69 * (1 + 9 * 0.05) = 0.69 * 1.45 ≈ 1.0
  const scaleFactor = 0.69 * (1 + (floor - 1) * 0.05);
  stats.attack = Math.round(stats.attack * scaleFactor);
  stats.defense = Math.round(stats.defense * scaleFactor);
  stats.hp = Math.round(stats.hp * scaleFactor);
  stats.baseAttack = Math.round(stats.baseAttack * scaleFactor);
  stats.baseDefense = Math.round(stats.baseDefense * scaleFactor);
  stats.baseHp = Math.round(stats.baseHp * scaleFactor);

  return { card, stats, floor, bonusAbilities };
}

// ---------------------------------------------------------------------------
// Record Management
// ---------------------------------------------------------------------------

/** Get the best floor record for a specific commander. */
export async function getCommanderRecord(
  discordId: string,
  guildId: string,
  userCardId: number
): Promise<number> {
  const record = await prisma.endlessTowerRecord.findUnique({
    where: {
      discordId_guildId_userCardId: { discordId, guildId, userCardId }
    }
  });
  return record?.bestFloor ?? 0;
}

/** Get the user's overall best floor across all commanders in this guild. */
export async function getBestRecord(
  discordId: string,
  guildId: string
): Promise<number> {
  const result = await prisma.endlessTowerRecord.aggregate({
    where: { discordId, guildId },
    _max: { bestFloor: true }
  });
  return result._max.bestFloor ?? 0;
}

/** Update the record if the new floor exceeds the current best. */
export async function updateRecord(
  discordId: string,
  guildId: string,
  userCardId: number,
  floor: number
): Promise<void> {
  const existing = await prisma.endlessTowerRecord.findUnique({
    where: {
      discordId_guildId_userCardId: { discordId, guildId, userCardId }
    }
  });

  if (!existing) {
    await prisma.endlessTowerRecord.create({
      data: { discordId, guildId, userCardId, bestFloor: floor }
    });
  } else if (floor > existing.bestFloor) {
    await prisma.endlessTowerRecord.update({
      where: { id: existing.id },
      data: { bestFloor: floor }
    });
  }
}

// ---------------------------------------------------------------------------
// Reward Management
// ---------------------------------------------------------------------------

/** Check if a user has already claimed a floor reward. */
export async function hasClaimedFloorReward(
  userId: string,
  floor: number
): Promise<boolean> {
  const record = await prisma.endlessTowerReward.findUnique({
    where: { userId_floor: { userId, floor } }
  });
  return record !== null;
}

export type FloorRewardResult = {
  gold: number;
  cards: { name: string; displayId: string }[];
  alreadyClaimed: boolean;
};

/**
 * Claim rewards for completing a floor (first-clear only).
 * Gold: floor * 1000
 * Every 5th floor: also 3 random cards matching boss color identity
 */
export async function claimFloorRewards(
  userId: string,
  floor: number,
  bossCard: CardLookup,
  guildId: string,
  channelId: string
): Promise<FloorRewardResult> {
  const alreadyClaimed = await hasClaimedFloorReward(userId, floor);
  if (alreadyClaimed) {
    return { gold: 0, cards: [], alreadyClaimed: true };
  }

  // Award gold
  const gold = floor * 1000;
  await addGold(userId, gold);

  // Award cards at milestone floors (every 5)
  const cards: { name: string; displayId: string }[] = [];
  if (floor % 5 === 0) {
    const rewardCards = await getRandomCardsByColorIdentity(3, bossCard.colorIdentity);

    // Create Drop record
    const drop = await prisma.drop.create({
      data: {
        guildId,
        channelId,
        dropperUserId: userId,
        dropType: "endless_tower",
        expiresAt: new Date(),
        resolvedAt: new Date(),
        slots: {
          create: rewardCards.map((card, idx) => ({
            slotIndex: idx,
            cardId: card.id,
            claimedByUserId: userId,
            claimedAt: new Date()
          }))
        }
      }
    });

    // Create UserCard records
    for (const card of rewardCards) {
      const condition = pickRandomCondition();
      const isClashEligible = isCommanderEligible({
        typeLine: card.typeLine,
        oracleText: card.oracleText,
        power: card.power,
        toughness: card.toughness,
        isMeldResult: false
      });
      const bonuses = isClashEligible ? rollClashBonuses(condition) : {};

      let userCard;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          userCard = await prisma.userCard.create({
            data: {
              displayId: generateDisplayId(),
              userId,
              cardId: card.id,
              dropId: drop.id,
              condition,
              ...bonuses
            }
          });
          break;
        } catch (err: unknown) {
          const isUniqueViolation =
            err != null &&
            typeof err === "object" &&
            "code" in err &&
            (err as { code: string }).code === "P2002";
          if (!isUniqueViolation || attempt === 4) throw err;
        }
      }

      cards.push({ name: card.name, displayId: userCard!.displayId });
    }
  }

  // Mark floor as claimed
  await prisma.endlessTowerReward.create({
    data: { userId, floor }
  });

  return { gold, cards, alreadyClaimed: false };
}
