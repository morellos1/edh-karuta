import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { CardLookup } from "../repositories/cardRepo.js";
import { findCardPrintsByName } from "../repositories/cardRepo.js";

const MARKET_REFRESH_MS = 3 * 60 * 60 * 1000; // 3 hours
const MARKET_CARD_COUNT = 6;
const MARKET_PRICE_MULTIPLIER = 10_000; // scryfall USD × 10000 = gold

const MARKET_IDS = ["A", "B", "C", "D", "E", "F"] as const;
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
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const path = join(__dirname, "..", "..", "topedhrec.csv");
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

/** Get the 6 cards for the current (or given) market slot. Deterministic per slot. */
export async function getMarketCardsForSlot(slotIndex: number): Promise<MarketCardEntry[]> {
  const names = loadMarketCardNames();
  if (names.length === 0) return [];

  const indices = names.map((_, i) => i);
  seededShuffle(indices, slotIndex);
  const pickedNames = indices.slice(0, MARKET_CARD_COUNT).map((i) => names[i]);

  const entries: MarketCardEntry[] = [];
  for (let i = 0; i < pickedNames.length; i++) {
    const name = pickedNames[i];
    const prints = await findCardPrintsByName(name);
    const withPrice = prints.filter((c) => c.usdPrice != null && Number(c.usdPrice) > 0);
    const card = withPrice.length
      ? withPrice.sort((a, b) => Number(a.usdPrice) - Number(b.usdPrice))[0]
      : prints[0];
    if (!card) continue;
    const usd = card.usdPrice != null ? Number(card.usdPrice) : 0;
    const priceGold = Number.isFinite(usd) && usd > 0 ? Math.round(usd * MARKET_PRICE_MULTIPLIER) : 0;
    entries.push({
      id: MARKET_IDS[i],
      name: card.name,
      card,
      priceGold
    });
  }
  return entries;
}

export { MARKET_IDS };
