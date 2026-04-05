import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CardLookup } from "../repositories/cardRepo.js";
import { findCardPrintsByName } from "../repositories/cardRepo.js";

const EUR_TO_USD = 1.15;
const MARKET_REFRESH_MS = 3 * 60 * 60 * 1000; // 3 hours
const MARKET_CARD_COUNT = 12;
const MARKET_PRICE_MULTIPLIER = 10_000; // scryfall USD × 10000 = gold
const MARKET_PAGE_SIZE = 6;

const MARKET_IDS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"] as const;
export type MarketCardId = (typeof MARKET_IDS)[number];

/** Resolve a card's base USD price, falling back to EUR converted. */
function resolveCardUsd(card: { usdPrice: string | null; eurPrice: string | null }): number {
  const usd = Number(card.usdPrice);
  if (Number.isFinite(usd) && usd > 0) return usd;
  const eur = Number(card.eurPrice);
  if (Number.isFinite(eur) && eur > 0) return Math.round(eur * EUR_TO_USD * 100) / 100;
  return 0;
}

export type MarketCardEntry = {
  id: MarketCardId;
  name: string;
  card: CardLookup;
  priceGold: number;
};

let cachedNames: string[] | null = null;

/** Parse a single CSV line respecting quoted fields. */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      let end = i + 1;
      while (end < line.length && line[end] !== '"') end++;
      out.push(line.slice(i + 1, end));
      i = end + 1;
      if (line[i] === ",") i++;
      continue;
    }
    let end = i;
    while (end < line.length && line[end] !== ",") end++;
    out.push(line.slice(i, end).trim());
    i = end + 1;
  }
  return out;
}

export function loadMarketCardNames(): string[] {
  if (cachedNames) return cachedNames;
  const path = join(process.cwd(), "topedhrec.csv");
  const raw = readFileSync(path, "utf-8");
  const lines = raw.split(/\r?\n/).filter((s) => s.trim());
  const names: string[] = [];
  // Row 0 = header, row 1 = "undefined" row
  for (let i = 2; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const name = cols[2]?.trim(); // "Name" column
    if (name && name !== "undefined") names.push(name);
  }
  cachedNames = names;
  return names;
}

/** Seeded RNG (mulberry32) for deterministic market slot. */
function mulberry32(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Shuffle array in place using seeded random (Fisher-Yates). */
function seededShuffle<T>(arr: T[], seed: number): void {
  const rng = mulberry32(seed);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

export function getMarketSlot(): { slotIndex: number; nextRefreshAt: Date } {
  const now = Date.now();
  const slotIndex = Math.floor(now / MARKET_REFRESH_MS);
  const nextRefreshAt = new Date((slotIndex + 1) * MARKET_REFRESH_MS);
  return { slotIndex, nextRefreshAt };
}

export function getTimeUntilRefresh(nextRefreshAt: Date): { minutes: number; seconds: number } {
  const ms = Math.max(0, nextRefreshAt.getTime() - Date.now());
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  return { minutes, seconds };
}

/** Resolve the top N card names for a given slot seed (no DB calls). */
function getSlotCardNames(slotIndex: number, count: number): Set<string> {
  const names = loadMarketCardNames();
  const indices = names.map((_, i) => i);
  seededShuffle(indices, slotIndex);
  const result = new Set<string>();
  for (let i = 0; i < indices.length && result.size < count; i++) {
    result.add(names[indices[i]]);
  }
  return result;
}

/* ------------------------------------------------------------------ */
/*  In-memory market cache – avoids re-querying DB every market view   */
/* ------------------------------------------------------------------ */

interface MarketCacheEntry {
  slotIndex: number;
  entries: MarketCardEntry[];
}

let marketCache: MarketCacheEntry | null = null;

/** Get the 12 cards for the current (or given) market slot. Deterministic per slot.
 *  Cards that appeared in the previous slot are excluded to keep the market fresh. */
export async function getMarketCardsForSlot(slotIndex: number): Promise<MarketCardEntry[]> {
  // Return cached result if it matches the requested slot.
  if (marketCache && marketCache.slotIndex === slotIndex) {
    return marketCache.entries;
  }

  const names = loadMarketCardNames();
  if (names.length === 0) return [];

  // Build a set of card names from the previous slot to exclude.
  const prevNames = getSlotCardNames(slotIndex - 1, MARKET_CARD_COUNT);

  const indices = names.map((_, i) => i);
  seededShuffle(indices, slotIndex);

  // Collect candidate names (excluding previous slot), then query DB in parallel.
  const candidateNames: string[] = [];
  for (let i = 0; i < indices.length && candidateNames.length < MARKET_CARD_COUNT * 3; i++) {
    const name = names[indices[i]];
    if (!prevNames.has(name)) candidateNames.push(name);
  }

  const allPrints = await Promise.all(candidateNames.map((name) => findCardPrintsByName(name)));

  const entries: MarketCardEntry[] = [];
  for (let i = 0; i < allPrints.length && entries.length < MARKET_CARD_COUNT; i++) {
    const prints = allPrints[i];
    const withPrice = prints.filter((c) => resolveCardUsd(c) > 0);
    const card = withPrice.length
      ? withPrice.sort((a, b) => resolveCardUsd(a) - resolveCardUsd(b))[0]
      : prints[0];
    if (!card) continue;
    const usd = resolveCardUsd(card);
    const priceGold = Number.isFinite(usd) && usd > 0 ? Math.round(usd * MARKET_PRICE_MULTIPLIER) : 0;
    entries.push({
      id: MARKET_IDS[entries.length],
      name: card.name,
      card,
      priceGold
    });
  }

  // Cache the result for this slot.
  marketCache = { slotIndex, entries };

  return entries;
}

/** Return the slice of market entries for a given page (1-indexed). */
export function getMarketPage(entries: MarketCardEntry[], page: number): MarketCardEntry[] {
  const start = (page - 1) * MARKET_PAGE_SIZE;
  return entries.slice(start, start + MARKET_PAGE_SIZE);
}

export const MARKET_TOTAL_PAGES = 2;

export { MARKET_IDS };
