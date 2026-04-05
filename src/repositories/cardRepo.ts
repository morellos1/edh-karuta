import type { Card } from "@prisma/client";
import { prisma } from "../db.js";
import type { Prisma } from "@prisma/client";
import { gameConfig } from "../config.js";
import { parsePT } from "../services/clashService.js";

export type CardLookup = {
  id: number;
  scryfallId: string;
  name: string;
  setCode: string;
  setName: string | null;
  collectorNumber: string;
  lang: string | null;
  usdPrice: string | null;
  eurPrice: string | null;
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
  power: string | null;
  toughness: string | null;
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
    eurPrice: card.eurPrice,
    rarity: card.rarity,
    colors: card.colors,
    colorIdentity: card.colorIdentity,
    imagePng: card.imagePng,
    imageSmall: card.imageSmall,
    imageNormal: card.imageNormal,
    imageLarge: card.imageLarge,
    manaCost: card.manaCost,
    typeLine: card.typeLine,
    oracleText: card.oracleText,
    power: card.power,
    toughness: card.toughness
  };
}

type RarityTarget = "common" | "uncommon" | "rare" | "mythic";
export type DropColorSymbol = "W" | "U" | "B" | "R" | "G";

// ---------------------------------------------------------------------------
// Card-pool cache: avoids re-running the expensive groupBy query on every
// single drop.  The cache is keyed by a serialised version of the WHERE clause
// and entries expire after CARD_POOL_TTL_MS (default 5 minutes).  It is also
// invalidated wholesale whenever the card catalogue is synced from Scryfall.
// ---------------------------------------------------------------------------
type CardPoolEntry = {
  groups: { name: string; _count: { name: number } }[];
  expiresAt: number;
};
const cardPoolCache = new Map<string, CardPoolEntry>();
const CARD_POOL_TTL_MS = 5 * 60 * 1000; // 5 minutes

/** Call after a Scryfall sync to force fresh groupBy data on the next drop. */
export function invalidateCardPoolCache(): void {
  cardPoolCache.clear();
}

function cacheKey(where: Prisma.CardWhereInput): string {
  return JSON.stringify(where);
}

async function getCardPoolGroups(
  where: Prisma.CardWhereInput
): Promise<{ name: string; _count: { name: number } }[]> {
  const key = cacheKey(where);
  const cached = cardPoolCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.groups;
  }
  const groups = await prisma.card.groupBy({
    by: ["name"],
    where,
    _count: { name: true }
  });
  cardPoolCache.set(key, { groups, expiresAt: Date.now() + CARD_POOL_TTL_MS });
  return groups;
}

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
    isMeldResult: false,
    lang: "en",
    imagePng: { not: null },
    ...(filterColor ? { colors: { contains: filterColor } } : {})
  };
}

/** Compute per-name selection weights.  Exported for testing. */
export function computeSelectionWeights(
  groups: { _count: { name: number } }[],
  uniform: boolean
): number[] {
  return uniform
    ? groups.map(() => 1)
    : groups.map((g) => Math.log2(g._count.name + 1));
}

async function pickRandomCard(
  where: Prisma.CardWhereInput,
  excludeNames: string[] = [],
  options: { uniformWeight?: boolean } = {}
): Promise<Card | null> {
  // Get distinct card names with their print counts for weighted selection.
  let groups = await getCardPoolGroups(where);

  // Filter out card names already picked in this drop to prevent duplicate
  // names appearing (even as different prints) in the same drop.
  if (excludeNames.length > 0) {
    const excluded = new Set(excludeNames);
    groups = groups.filter((g) => !excluded.has(g.name));
  }

  if (groups.length === 0) return null;

  // When uniformWeight is true, every unique card name has equal probability.
  // Otherwise, weight = log2(printCount + 1) so a card with 100 prints is
  // ~6.7x more likely than a single-print card instead of 100x.
  const weights = computeSelectionWeights(groups, options.uniformWeight ?? false);
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  let roll = Math.random() * totalWeight;

  let selectedIdx = 0;
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i];
    if (roll <= 0) {
      selectedIdx = i;
      break;
    }
  }

  // Pick a random print of the selected card name.
  const selectedName = groups[selectedIdx].name;
  const printCount = groups[selectedIdx]._count.name;
  const skip = Math.floor(Math.random() * printCount);

  return prisma.card.findFirst({
    where: { ...where, name: selectedName },
    orderBy: { scryfallId: "asc" },
    skip,
    take: 1
  });
}

/**
 * Shared pick loop: pick `count` unique cards from the pool defined by
 * `baseWhereFn(pickedIds)`.  When `useRarityRoll` is true, each iteration
 * rolls a target rarity and falls back to the full pool on miss.
 */
async function pickMultipleCards(
  count: number,
  baseWhereFn: (pickedIds: number[]) => Prisma.CardWhereInput,
  options: { useRarityRoll?: boolean; uniformWeight?: boolean } = {}
): Promise<CardLookup[]> {
  const cards: Card[] = [];
  const pickedIds: number[] = [];
  const pickedNames: string[] = [];
  const pickOpts = options.uniformWeight ? { uniformWeight: true } : {};

  while (cards.length < count) {
    let candidate: Card | null = null;
    if (options.useRarityRoll) {
      const targetRarity = rollTargetRarity();
      candidate = await pickRandomCard(
        { ...baseWhereFn(pickedIds), rarity: targetRarity },
        pickedNames,
        pickOpts
      );
      if (!candidate) {
        candidate = await pickRandomCard(baseWhereFn(pickedIds), pickedNames, pickOpts);
      }
    } else {
      candidate = await pickRandomCard(baseWhereFn(pickedIds), pickedNames, pickOpts);
    }
    if (!candidate) break;

    pickedIds.push(candidate.id);
    pickedNames.push(candidate.name);
    cards.push(candidate);
  }

  return cards.map(toCardLookup);
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

  return pickMultipleCards(count, (ids) => baseDroppableWhere(ids, filterColor), { useRarityRoll: true });
}

/**
 * Exclude card types/layouts whose front face is never a valid commander even
 * when the combined type_line (front // back) contains "Legendary Creature".
 *
 * - flip:   Kamigawa flip cards — the top (front) half is a non-legendary
 *           creature; only the flipped (back) half is legendary.
 * - Battle: Siege battles that transform into legendary creatures — the front
 *           face is a Battle, not a Legendary Creature.  Scryfall uses
 *           layout "transform" for these, so we filter by type_line instead.
 */
const NON_COMMANDER_LAYOUTS = ["flip"];

export function commanderWhereFilter(): Prisma.CardWhereInput {
  return {
    layout: { notIn: NON_COMMANDER_LAYOUTS },
    isMeldResult: false,
    NOT: { typeLine: { contains: "Battle" } },
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

  // Commanders are almost exclusively rare/mythic, so the normal rarity
  // distribution (50% common, 30% uncommon) would miss ~80% of rolls and
  // fall back to the full pool every time.  Instead, skip rarity filtering
  // and use uniform weighting per unique card name so every commander has
  // an equal chance — regardless of how many variant printings it has.
  return pickMultipleCards(
    count,
    (ids) => ({ ...baseDroppableWhere(ids), ...commanderWhereFilter() }),
    { uniformWeight: true }
  );
}

export async function getRandomLandCards(
  count: number
): Promise<CardLookup[]> {
  const landWhere: Prisma.CardWhereInput = {
    ...baseDroppableWhere([]),
    typeLine: { contains: "Land" },
    isBasicLand: false
  };
  const total = await prisma.card.count({ where: landWhere });
  if (total < count) {
    throw new Error(`Not enough nonbasic land cards in pool to drop ${count} cards.`);
  }

  return pickMultipleCards(
    count,
    (ids) => ({ ...baseDroppableWhere(ids), typeLine: { contains: "Land" }, isBasicLand: false }),
    { useRarityRoll: true }
  );
}

/**
 * Normalize typographic (smart/curly) quotes and apostrophes to their
 * ASCII equivalents so card searches work regardless of the user's
 * keyboard / autocorrect settings.
 */
function normalizeQuotes(input: string): string {
  return input
    .replace(/[\u2018\u2019\u201A\u2032]/g, "'")   // ' ' ‚ ′  → '
    .replace(/[\u201C\u201D\u201E\u2033]/g, '"');   // " " „ ″  → "
}

/** Strip common punctuation so "thassas oracle" matches "Thassa's Oracle". */
function stripSymbols(input: string): string {
  return input.replace(/['\-,.:;"!?]/g, "");
}

export async function findCardByQuery(query: string): Promise<CardLookup | null> {
  const trimmed = normalizeQuotes(query.trim());
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

  // Fast path: exact substring match (handles most queries).
  const exact = await prisma.card.findFirst({
    where: {
      name: { contains: trimmed },
      isCommanderLegal: true,
      lang: "en"
    },
    orderBy: [{ releasedAt: "asc" }, { id: "asc" }],
    select: cardSelect
  });
  if (exact) return exact;

  // Fallback: strip punctuation from both the query and card names so that
  // e.g. "thassas oracle" still finds "Thassa's Oracle".
  const stripped = stripSymbols(trimmed);

  const rows = await prisma.$queryRawUnsafe<{ id: number }[]>(
    `SELECT id FROM Card
     WHERE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(name,'''''',''),'-',''),',',''),'.',''),':',''),';',''),'"',''),'!',''),'?','')
           LIKE '%' || ? || '%'
       AND isCommanderLegal = 1
       AND lang = 'en'
     ORDER BY releasedAt ASC, id ASC
     LIMIT 1`,
    stripped
  );
  if (!rows.length) return null;

  return prisma.card.findFirst({
    where: { id: rows[0].id },
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
  eurPrice: true,
  rarity: true,
  colors: true,
  colorIdentity: true,
  imagePng: true,
  imageSmall: true,
  imageNormal: true,
  imageLarge: true,
  manaCost: true,
  typeLine: true,
  oracleText: true,
  power: true,
  toughness: true
} as const;

/** Strip combining diacritics so "Éowyn" → "Eowyn", "Lim-Dûl" → "Lim-Dul", etc. */
function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** All prints of a card by exact name, ordered by first print (releasedAt asc). */
export async function findCardPrintsByName(name: string): Promise<CardLookup[]> {
  const trimmed = name.trim();
  if (!trimmed) return [];

  const orderBy: Prisma.CardOrderByWithRelationInput[] = [{ releasedAt: "asc" }, { id: "asc" }];
  const baseWhere = { isCommanderLegal: true, lang: "en" } as const;

  // Try exact match with NFC normalization (most common form).
  const nfc = trimmed.normalize("NFC");
  const cards = await prisma.card.findMany({
    where: { name: nfc, ...baseWhere },
    orderBy,
    select: cardSelect
  });
  if (cards.length > 0) return cards;

  // Try NFD normalization in case the DB stores decomposed characters.
  const nfd = trimmed.normalize("NFD");
  if (nfd !== nfc) {
    const nfdCards = await prisma.card.findMany({
      where: { name: nfd, ...baseWhere },
      orderBy,
      select: cardSelect
    });
    if (nfdCards.length > 0) return nfdCards;
  }

  // Fallback for accented names: find the longest ASCII-only substring in the
  // accent-stripped name, use it as a `contains` filter, then verify in JS.
  const ascii = stripAccents(nfc);
  if (ascii === nfc) return []; // no accents — exact match was definitive

  // Pick the longest contiguous ASCII word sequence (at least 4 chars) for the query.
  const segments = ascii.match(/[a-zA-Z0-9][\w' -]{3,}/g) ?? [];
  const fragment = segments.sort((a, b) => b.length - a.length)[0]?.trim();
  if (!fragment) return [];

  const candidates = await prisma.card.findMany({
    where: { name: { contains: fragment }, ...baseWhere },
    orderBy,
    select: cardSelect
  });

  return candidates.filter((c) => stripAccents(c.name) === ascii);
}

/** Batch-fetch all prints for multiple card names in a single query.
 *  Falls back to individual lookups for names that need NFD/accent handling. */
export async function findCardPrintsByNames(
  names: string[]
): Promise<Map<string, CardLookup[]>> {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  if (!unique.length) return new Map();

  const nfcNames = unique.map((n) => n.normalize("NFC"));
  const orderBy: Prisma.CardOrderByWithRelationInput[] = [{ releasedAt: "asc" }, { id: "asc" }];
  const baseWhere = { isCommanderLegal: true, lang: "en" } as const;

  const cards = await prisma.card.findMany({
    where: { name: { in: nfcNames }, ...baseWhere },
    orderBy,
    select: cardSelect
  });

  const result = new Map<string, CardLookup[]>();
  for (const card of cards) {
    const existing = result.get(card.name) ?? [];
    existing.push(card);
    result.set(card.name, existing);
  }

  // For names with no NFC match, fall back to individual lookup
  // (handles NFD normalization and accent-stripped names like "Lim-Dûl")
  for (const name of unique) {
    const nfc = name.normalize("NFC");
    if (!result.has(nfc)) {
      const fallback = await findCardPrintsByName(name);
      if (fallback.length > 0) {
        result.set(fallback[0].name, fallback);
      }
    }
  }

  return result;
}

const DEFAULT_BASE_PRICE_USD = 0.1; // 10g before condition multiplier

import { EUR_TO_USD } from "../utils/cardFormatting.js";

/** Cheapest USD price among all prints of each name that have a valid price (USD or EUR converted). Names with no valid print return undefined (caller uses DEFAULT_BASE_PRICE_USD). */
export async function getCheapestPrintPricesByNames(
  names: string[]
): Promise<Map<string, number>> {
  const unique = [...new Set(names.filter(Boolean))];
  if (!unique.length) return new Map();
  const cards = await prisma.card.findMany({
    where: {
      name: { in: unique },
      OR: [
        { usdPrice: { not: null } },
        { eurPrice: { not: null } }
      ]
    },
    select: { name: true, usdPrice: true, eurPrice: true }
  });
  const map = new Map<string, number>();
  for (const c of cards) {
    let num = Number(c.usdPrice);
    if (!Number.isFinite(num) || num <= 0) {
      num = Math.round(Number(c.eurPrice) * EUR_TO_USD * 100) / 100;
    }
    if (!Number.isFinite(num) || num <= 0) continue;
    const current = map.get(c.name);
    if (current === undefined || num < current) map.set(c.name, num);
  }
  return map;
}

export function getDefaultBasePriceUsd(): number {
  return DEFAULT_BASE_PRICE_USD;
}

/**
 * Pick `count` random droppable cards whose colorIdentity overlaps with the
 * given colors (comma-separated W,U,B,R,G). If colorIdentity is empty/null
 * (colorless), picks from the full pool.
 */
export async function getRandomCardsByColorIdentity(
  count: number,
  colorIdentity: string | null
): Promise<CardLookup[]> {
  const colors = colorIdentity
    ? colorIdentity.split(",").map((c) => c.trim()).filter(Boolean)
    : [];

  if (colors.length === 0) {
    return getRandomDroppableCards(count);
  }

  // Build OR conditions: card's colorIdentity contains at least one of the boss's colors
  const colorFilters = colors.map((color) => ({
    colorIdentity: { contains: color }
  }));

  return pickMultipleCards(
    count,
    (ids) => ({
      ...baseDroppableWhere(ids),
      OR: colorFilters
    }),
    { useRarityRoll: true }
  );
}

/**
 * Get all distinct commander-eligible card names, sorted alphabetically.
 * Used by daily raid for deterministic boss selection.
 */
export async function getCommanderCardNames(): Promise<string[]> {
  const groups = await prisma.card.groupBy({
    by: ["name"],
    where: {
      ...baseDroppableWhere([]),
      ...commanderWhereFilter()
    }
  });
  return groups.map((g) => g.name).sort();
}

/**
 * Get a single card by exact name (first print, English, commander-legal).
 */
export async function getCardByName(name: string): Promise<CardLookup | null> {
  return prisma.card.findFirst({
    where: {
      name,
      isCommanderLegal: true,
      lang: "en",
      imagePng: { not: null }
    },
    orderBy: [{ releasedAt: "asc" }, { id: "asc" }],
    select: cardSelect
  });
}

/**
 * Pick a single random creature card from the full pool (not just commander-legal).
 * Used by Endless Tower for random floor bosses.
 * When minPower is provided, re-rolls until a card with sufficient power is found.
 */
export async function getRandomCreatureCard(minPower?: number): Promise<CardLookup> {
  const where: Prisma.CardWhereInput = {
    typeLine: { contains: "Creature" },
    isBasicLand: false,
    isMeldResult: false,
    lang: "en",
    imagePng: { not: null },
    power: { not: null },
    toughness: { not: null }
  };
  const total = await prisma.card.count({ where });
  if (total === 0) {
    throw new Error("No creature cards available for Endless Tower boss.");
  }

  const maxAttempts = minPower ? 50 : 1;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const skip = Math.floor(Math.random() * total);
    const card = await prisma.card.findFirst({
      where,
      skip,
      take: 1,
      select: cardSelect
    });
    if (!card) continue;

    // Check minimum power requirement
    if (minPower) {
      const power = parsePT(card.power);
      if (power < minPower) continue;
    }

    return card;
  }

  // Fallback: return any creature if min power retries exhausted
  const skip = Math.floor(Math.random() * total);
  const card = await prisma.card.findFirst({
    where,
    skip,
    take: 1,
    select: cardSelect
  });
  if (!card) {
    throw new Error("Failed to pick random creature card.");
  }
  return card;
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
