import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CardLookup } from "../repositories/cardRepo.js";
import { findCardPrintsByName } from "../repositories/cardRepo.js";

const MARKET_REFRESH_MS = 3 * 60 * 60 * 1000; // 3 hours
const MARKET_CARD_COUNT = 12;
const MARKET_PRICE_MULTIPLIER = 10_000; // scryfall USD × 10000 = gold
const MARKET_PAGE_SIZE = 6;

const MARKET_IDS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"] as const;
export type MarketCardId = (typeof MARKET_IDS)[number];

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


/** Get the 6 cards for the current (or given) market slot. Deterministic per slot. */
export async function getMarketCardsForSlot(slotIndex: number): Promise<MarketCardEntry[]> {
  const names = loadMarketCardNames();
  if (names.length === 0) return [];

  const indices = names.map((_, i) => i);
  seededShuffle(indices, slotIndex);

  const entries: MarketCardEntry[] = [];
  for (let i = 0; i < indices.length && entries.length < MARKET_CARD_COUNT; i++) {
    const name = names[indices[i]];
    const prints = await findCardPrintsByName(name);
    const withPrice = prints.filter((c) => c.usdPrice != null && Number(c.usdPrice) > 0);
    const card = withPrice.length
      ? withPrice.sort((a, b) => Number(a.usdPrice) - Number(b.usdPrice))[0]
      : prints[0];
    if (!card) continue;
    const usd = card.usdPrice != null ? Number(card.usdPrice) : 0;
    const priceGold = Number.isFinite(usd) && usd > 0 ? Math.round(usd * MARKET_PRICE_MULTIPLIER) : 0;
    entries.push({
      id: MARKET_IDS[entries.length],
      name: card.name,
      card,
      priceGold
    });
  }
  return entries;
}

/** Return the slice of market entries for a given page (1-indexed). */
export function getMarketPage(entries: MarketCardEntry[], page: number): MarketCardEntry[] {
  const start = (page - 1) * MARKET_PAGE_SIZE;
  return entries.slice(start, start + MARKET_PAGE_SIZE);
}

export const MARKET_TOTAL_PAGES = 2;

export { MARKET_IDS };
