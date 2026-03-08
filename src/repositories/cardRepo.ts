import type { Card } from "@prisma/client";
import { prisma } from "../db.js";
import type { Prisma } from "@prisma/client";
import { gameConfig } from "../config.js";

export type CardLookup = {
  id: number;
  scryfallId: string;
  name: string;
  setCode: string;
  setName: string | null;
  collectorNumber: string;
  lang: string | null;
  usdPrice: string | null;
  rarity: string | null;
  colors: string | null;
  colorIdentity: string | null;
  imagePng: string | null;
  imageSmall: string | null;
  imageNormal: string | null;
  imageLarge: string | null;
  manaCost: string | null;
  typeLine: string | null;
  oracleText: string | null;
};

function toCardLookup(card: Card): CardLookup {
  return {
    id: card.id,
    scryfallId: card.scryfallId,
    name: card.name,
    setCode: card.setCode,
    setName: card.setName,
    collectorNumber: card.collectorNumber,
    lang: card.lang,
    usdPrice: card.usdPrice,
    rarity: card.rarity,
    colors: card.colors,
    colorIdentity: card.colorIdentity,
    imagePng: card.imagePng,
    imageSmall: card.imageSmall,
    imageNormal: card.imageNormal,
    imageLarge: card.imageLarge,
    manaCost: card.manaCost,
    typeLine: card.typeLine,
    oracleText: card.oracleText
  };
}

type RarityTarget = "common" | "uncommon" | "rare" | "mythic";
export type DropColorSymbol = "W" | "U" | "B" | "R" | "G";

// Cached at module load since gameConfig is immutable at runtime.
const rarityThresholds = (() => {
  const common = gameConfig.dropRarity.commonChance;
  const uncommon = gameConfig.dropRarity.uncommonChance;
  const rare = gameConfig.dropRarity.rareChance;
  const mythic = gameConfig.dropRarity.mythicChance;
  const sum = common + uncommon + rare + mythic;

  const scale = sum > 0 ? 1 / sum : 1;
  const commonScaled = common * scale;
  const uncommonScaled = uncommon * scale;
  const rareScaled = rare * scale;

  return {
    commonThreshold: commonScaled,
    uncommonThreshold: commonScaled + uncommonScaled,
    rareThreshold: commonScaled + uncommonScaled + rareScaled
  };
})();

function rollTargetRarity(): RarityTarget {
  const r = Math.random();
  if (r < rarityThresholds.commonThreshold) return "common";
  if (r < rarityThresholds.uncommonThreshold) return "uncommon";
  if (r < rarityThresholds.rareThreshold) return "rare";
  return "mythic";
}

function baseDroppableWhere(
  excludeIds: number[],
  filterColor?: DropColorSymbol
): Prisma.CardWhereInput {
  return {
    id: excludeIds.length ? { notIn: excludeIds } : undefined,
    isBasicLand: false,
    isCommanderLegal: true,
    lang: "en",
    imagePng: { not: null },
    ...(filterColor ? { colors: { contains: filterColor } } : {})
  };
}

async function pickRandomCard(where: Prisma.CardWhereInput): Promise<Card | null> {
  const total = await prisma.card.count({
    where
  });

  if (total < 1) {
    return null;
  }

  const skip = Math.floor(Math.random() * total);
  return prisma.card.findFirst({
    where,
    skip,
    take: 1
  });
}

export async function getRandomDroppableCards(
  count: number,
  filterColor?: DropColorSymbol
): Promise<CardLookup[]> {
  const total = await prisma.card.count({
    where: baseDroppableWhere([], filterColor)
  });
  if (total < count) {
    throw new Error(`Not enough cards in pool to drop ${count} cards.`);
  }

  const cards: Card[] = [];
  const pickedIds: number[] = [];
  while (cards.length < count) {
    const targetRarity = rollTargetRarity();
    const strictWhere: Prisma.CardWhereInput = {
      ...baseDroppableWhere(pickedIds, filterColor),
      rarity: targetRarity
    };

    let candidate = await pickRandomCard(strictWhere);
    if (!candidate) {
      // Fallback if the targeted rarity pool is exhausted.
      candidate = await pickRandomCard(baseDroppableWhere(pickedIds, filterColor));
    }
    if (!candidate) {
      break;
    }

    pickedIds.push(candidate.id);
    cards.push(candidate);
  }

  return cards.map(toCardLookup);
}

function commanderWhereFilter(): Prisma.CardWhereInput {
  return {
    OR: [
      // Legendary creatures
      {
        typeLine: { contains: "Legendary" },
        AND: { typeLine: { contains: "Creature" } }
      },
      // Planeswalkers that can be your commander
      {
        typeLine: { contains: "Planeswalker" },
        oracleText: { contains: "can be your commander" }
      },
      // Legendary Vehicles with power and toughness
      {
        typeLine: { contains: "Legendary" },
        AND: { typeLine: { contains: "Vehicle" } },
        power: { not: null },
        toughness: { not: null }
      },
      // Legendary Spacecraft with power and toughness
      {
        typeLine: { contains: "Legendary" },
        AND: { typeLine: { contains: "Spacecraft" } },
        power: { not: null },
        toughness: { not: null }
      }
    ]
  };
}

export async function getRandomCommanderCards(
  count: number
): Promise<CardLookup[]> {
  const where: Prisma.CardWhereInput = {
    ...baseDroppableWhere([]),
    ...commanderWhereFilter()
  };
  const total = await prisma.card.count({ where });
  if (total < count) {
    throw new Error(`Not enough commander cards in pool to drop ${count} cards.`);
  }

  const cards: Card[] = [];
  const pickedIds: number[] = [];
  while (cards.length < count) {
    const targetRarity = rollTargetRarity();
    const strictWhere: Prisma.CardWhereInput = {
      ...baseDroppableWhere(pickedIds),
      ...commanderWhereFilter(),
      rarity: targetRarity
    };

    let candidate = await pickRandomCard(strictWhere);
    if (!candidate) {
      candidate = await pickRandomCard({
        ...baseDroppableWhere(pickedIds),
        ...commanderWhereFilter()
      });
    }
    if (!candidate) {
      break;
    }

    pickedIds.push(candidate.id);
    cards.push(candidate);
  }

  return cards.map(toCardLookup);
}

export async function findCardByQuery(query: string): Promise<CardLookup | null> {
  const trimmed = query.trim();
  const setAndCollector = /^([a-z0-9]{2,6})\s+([a-z0-9]+)$/i.exec(trimmed);

  if (setAndCollector) {
    const [, setCode, collectorNumber] = setAndCollector;
    const bySet = await prisma.card.findFirst({
      where: {
        setCode: setCode.toLowerCase(),
        collectorNumber: collectorNumber.toLowerCase(),
        isCommanderLegal: true,
        lang: "en"
      },
      select: cardSelect
    });
    if (bySet) return bySet;
    // No set+collector match — fall through to name search so queries like
    // "sol ring" or "arcane signet" aren't swallowed by the set regex.
  }

  return prisma.card.findFirst({
    where: {
      name: { contains: trimmed },
      isCommanderLegal: true,
      lang: "en"
    },
    orderBy: [{ releasedAt: "asc" }, { id: "asc" }],
    select: cardSelect
  });
}

const cardSelect = {
  id: true,
  scryfallId: true,
  name: true,
  setCode: true,
  setName: true,
  collectorNumber: true,
  lang: true,
  usdPrice: true,
  rarity: true,
  colors: true,
  colorIdentity: true,
  imagePng: true,
  imageSmall: true,
  imageNormal: true,
  imageLarge: true,
  manaCost: true,
  typeLine: true,
  oracleText: true
} as const;

/** All prints of a card by exact name, ordered by first print (releasedAt asc). */
export async function findCardPrintsByName(name: string): Promise<CardLookup[]> {
  const trimmed = name.trim();
  if (!trimmed) return [];
  const cards = await prisma.card.findMany({
    where: {
      name: trimmed,
      isCommanderLegal: true,
      lang: "en"
    },
    orderBy: [{ releasedAt: "asc" }, { id: "asc" }],
    select: cardSelect
  });
  return cards;
}

const DEFAULT_BASE_PRICE_USD = 0.1; // 10g before condition multiplier

/** Cheapest USD price among all prints of each name that have a valid price. Names with no valid print return undefined (caller uses DEFAULT_BASE_PRICE_USD). */
export async function getCheapestPrintPricesByNames(
  names: string[]
): Promise<Map<string, number>> {
  const unique = [...new Set(names.filter(Boolean))];
  if (!unique.length) return new Map();
  const cards = await prisma.card.findMany({
    where: {
      name: { in: unique },
      usdPrice: { not: null }
    },
    select: { name: true, usdPrice: true }
  });
  const map = new Map<string, number>();
  for (const c of cards) {
    const num = Number(c.usdPrice);
    if (!Number.isFinite(num) || num <= 0) continue;
    const current = map.get(c.name);
    if (current === undefined || num < current) map.set(c.name, num);
  }
  return map;
}

export function getDefaultBasePriceUsd(): number {
  return DEFAULT_BASE_PRICE_USD;
}

/** Look up the type line for each card name (uses the earliest print). */
export async function getTypeLinesByNames(
  names: string[]
): Promise<Map<string, string>> {
  const unique = [...new Set(names.filter(Boolean))];
  if (!unique.length) return new Map();
  const cards = await prisma.card.findMany({
    where: { name: { in: unique }, isCommanderLegal: true, lang: "en" },
    orderBy: [{ releasedAt: "asc" }, { id: "asc" }],
    select: { name: true, typeLine: true },
    distinct: ["name"]
  });
  const map = new Map<string, string>();
  for (const c of cards) {
    if (c.typeLine && !map.has(c.name)) map.set(c.name, c.typeLine);
  }
  return map;
}
