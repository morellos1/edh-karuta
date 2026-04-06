import axios from "axios";
import sharp from "sharp";
import type { CardLookup } from "../repositories/cardRepo.js";
import { getCardImageUrl } from "../utils/cardFormatting.js";

const MAX_CANVAS_WIDTH = 1800;
const PADDING = 12;
const CARD_ASPECT_RATIO = 1.39375;

/* ------------------------------------------------------------------ */
/*  In-memory image cache – avoids re-downloading the same card art   */
/* ------------------------------------------------------------------ */

interface CacheEntry {
  buffer: Buffer;
  accessedAt: number;
}

/** Max cached images. ~200 images ≈ 40-80 MB depending on resolution. */
const IMAGE_CACHE_MAX = 200;
/** Evict images not accessed for 3 hours (matches market refresh interval). */
const IMAGE_CACHE_TTL_MS = 3 * 60 * 60 * 1000;

const imageCache = new Map<string, CacheEntry>();

function evictStaleEntries(): void {
  const now = Date.now();
  for (const [key, entry] of imageCache) {
    if (now - entry.accessedAt > IMAGE_CACHE_TTL_MS) {
      imageCache.delete(key);
    }
  }
}

function evictOldest(): void {
  let oldestKey: string | undefined;
  let oldestTime = Infinity;
  for (const [key, entry] of imageCache) {
    if (entry.accessedAt < oldestTime) {
      oldestTime = entry.accessedAt;
      oldestKey = key;
    }
  }
  if (oldestKey) imageCache.delete(oldestKey);
}

async function loadCardImage(url: string): Promise<Buffer> {
  const cached = imageCache.get(url);
  if (cached) {
    cached.accessedAt = Date.now();
    return cached.buffer;
  }

  const response = await axios.get<ArrayBuffer>(url, {
    responseType: "arraybuffer",
    timeout: 15000
  });
  const buffer = Buffer.from(response.data);

  // Make room if needed
  evictStaleEntries();
  if (imageCache.size >= IMAGE_CACHE_MAX) {
    evictOldest();
  }

  imageCache.set(url, { buffer, accessedAt: Date.now() });
  return buffer;
}

export async function buildDropCollage(cards: CardLookup[]): Promise<Buffer> {
  const columns = cards.length;
  const cardWidth = Math.floor((MAX_CANVAS_WIDTH - (columns + 1) * PADDING) / columns);
  const cardHeight = Math.round(cardWidth * CARD_ASPECT_RATIO);
  const canvasWidth = PADDING + columns * (cardWidth + PADDING);
  const canvasHeight = cardHeight + PADDING * 2;

  const imageUrls = cards.map((card) => {
    const url = getCardImageUrl(card);
    if (!url) throw new Error(`Card ${card.name} is missing image URLs.`);
    return url;
  });

  // Download all card images in parallel instead of sequentially.
  const imageBuffers = await Promise.all(imageUrls.map(loadCardImage));

  const composites: sharp.OverlayOptions[] = await Promise.all(
    imageBuffers.map(async (buf, i) => {
      const resized = await sharp(buf)
        .resize(cardWidth, cardHeight, { fit: "cover" })
        .toBuffer();
      return {
        input: resized,
        left: PADDING + i * (cardWidth + PADDING),
        top: PADDING
      };
    })
  );

  return sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 3,
      background: { r: 20, g: 20, b: 20 }
    }
  })
    .composite(composites)
    .webp({ quality: 92 })
    .toBuffer();
}

const GRID_COLS = 4;
const GRID_ROWS = 2;
const GRID_PADDING = PADDING;

/** Build a single 2×4 grid image (8 cards) for collection album view. Embedded in the collection message. */
export async function buildCollectionGrid(cards: CardLookup[]): Promise<Buffer> {
  const count = Math.min(cards.length, GRID_COLS * GRID_ROWS);
  if (count === 0) {
    return sharp({
      create: { width: 400, height: 560, channels: 3, background: { r: 30, g: 30, b: 30 } }
    })
      .webp({ quality: 80 })
      .toBuffer();
  }

  const cardWidth = Math.floor(
    (MAX_CANVAS_WIDTH - (GRID_COLS + 1) * GRID_PADDING) / GRID_COLS
  );
  const cardHeight = Math.round(cardWidth * CARD_ASPECT_RATIO);
  const canvasWidth = GRID_PADDING + GRID_COLS * (cardWidth + GRID_PADDING);
  const canvasHeight = GRID_PADDING + GRID_ROWS * (cardHeight + GRID_PADDING);

  // Download and resize all card images in parallel.
  const compositeResults = await Promise.all(
    cards.slice(0, count).map(async (card, i) => {
      const imageUrl = getCardImageUrl(card);
      if (!imageUrl) return null;
      const col = i % GRID_COLS;
      const row = Math.floor(i / GRID_COLS);
      const x = GRID_PADDING + col * (cardWidth + GRID_PADDING);
      const y = GRID_PADDING + row * (cardHeight + GRID_PADDING);
      try {
        const imageBuffer = await loadCardImage(imageUrl);
        const resized = await sharp(imageBuffer)
          .resize(cardWidth, cardHeight, { fit: "cover" })
          .toBuffer();
        return { input: resized, left: x, top: y } as sharp.OverlayOptions;
      } catch {
        return null;
      }
    })
  );
  const composites = compositeResults.filter((c): c is sharp.OverlayOptions => c !== null);

  return sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 3,
      background: { r: 20, g: 20, b: 20 }
    }
  })
    .composite(composites)
    .webp({ quality: 92 })
    .toBuffer();
}

const MARKET_COLS = 3;
const MARKET_ROWS = 2;
const MARKET_PADDING = PADDING;

function buildLetterBadge(letter: string): Buffer {
  const safe = letter.replace(/[^A-Za-z0-9]/g, "").slice(0, 2) || "?";
  const svg = `<svg width="78" height="52" xmlns="http://www.w3.org/2000/svg">
<rect x="0" y="0" width="78" height="52" rx="8" ry="8" fill="#000000" fill-opacity="0.72"/>
<text x="39" y="34" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="#FFFFFF">${safe}</text>
</svg>`;
  return Buffer.from(svg);
}

/** Build a single 2x3 market image with a letter badge on each card. */
export async function buildMarketGrid(cards: CardLookup[], labels: string[]): Promise<Buffer> {
  const count = Math.min(cards.length, MARKET_COLS * MARKET_ROWS, labels.length);
  if (count === 0) {
    return sharp({
      create: { width: 400, height: 560, channels: 3, background: { r: 30, g: 30, b: 30 } }
    })
      .webp({ quality: 80 })
      .toBuffer();
  }

  const MARKET_MAX_WIDTH = 1800;
  const cardWidth = Math.floor(
    (MARKET_MAX_WIDTH - (MARKET_COLS + 1) * MARKET_PADDING) / MARKET_COLS
  );
  const cardHeight = Math.round(cardWidth * CARD_ASPECT_RATIO);
  const canvasWidth = MARKET_PADDING + MARKET_COLS * (cardWidth + MARKET_PADDING);
  const canvasHeight = MARKET_PADDING + MARKET_ROWS * (cardHeight + MARKET_PADDING);

  // Download and resize all market card images in parallel.
  const compositeResults = await Promise.all(
    cards.slice(0, count).map(async (card, i) => {
      const imageUrl = getCardImageUrl(card);
      if (!imageUrl) return [];
      const col = i % MARKET_COLS;
      const row = Math.floor(i / MARKET_COLS);
      const x = MARKET_PADDING + col * (cardWidth + MARKET_PADDING);
      const y = MARKET_PADDING + row * (cardHeight + MARKET_PADDING);
      try {
        const imageBuffer = await loadCardImage(imageUrl);
        const resized = await sharp(imageBuffer)
          .resize(cardWidth, cardHeight, { fit: "cover" })
          .toBuffer();
        return [
          { input: resized, left: x, top: y } as sharp.OverlayOptions,
          { input: buildLetterBadge(labels[i]), left: x + 10, top: y + 10 } as sharp.OverlayOptions
        ];
      } catch {
        return [];
      }
    })
  );
  const composites = compositeResults.flat();

  return sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 3,
      background: { r: 20, g: 20, b: 20 }
    }
  })
    .composite(composites)
    .webp({ quality: 92 })
    .toBuffer();
}

function buildVsBadge(): Buffer {
  const svg = `<svg width="260" height="120" xmlns="http://www.w3.org/2000/svg">
<text x="130" y="80" text-anchor="middle" font-family="Arial, sans-serif" font-size="72" font-weight="900" fill="#FFFFFF" stroke="#000000" stroke-width="3">VS</text>
</svg>`;
  return Buffer.from(svg);
}

/** Build a 2-card clash preview image with "VS" between cards. */
export async function buildClashPairImage(left: CardLookup, right: CardLookup): Promise<Buffer> {
  const cardWidth = 760;
  const cardHeight = Math.round(cardWidth * CARD_ASPECT_RATIO);
  const vsWidth = 260;
  const canvasWidth = PADDING * 4 + cardWidth * 2 + vsWidth;
  const canvasHeight = cardHeight + PADDING * 2;
  const leftX = PADDING;
  const leftY = PADDING;
  const vsX = leftX + cardWidth + PADDING;
  const vsY = Math.round((canvasHeight - 120) / 2);
  const rightX = vsX + vsWidth + PADDING;
  const rightY = PADDING;

  const leftUrl = getCardImageUrl(left);
  const rightUrl = getCardImageUrl(right);
  if (!leftUrl || !rightUrl) {
    throw new Error("Clash cards must have images.");
  }

  const [leftBuffer, rightBuffer] = await Promise.all([loadCardImage(leftUrl), loadCardImage(rightUrl)]);
  const [leftResized, rightResized] = await Promise.all([
    sharp(leftBuffer).resize(cardWidth, cardHeight, { fit: "cover" }).toBuffer(),
    sharp(rightBuffer).resize(cardWidth, cardHeight, { fit: "cover" }).toBuffer()
  ]);

  return sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 3,
      background: { r: 20, g: 20, b: 20 }
    }
  })
    .composite([
      { input: leftResized, left: leftX, top: leftY },
      { input: rightResized, left: rightX, top: rightY },
      { input: buildVsBadge(), left: vsX, top: vsY }
    ])
    .webp({ quality: 92 })
    .toBuffer();
}

function buildTradeArrow(): Buffer {
  const svg = `<svg width="260" height="120" xmlns="http://www.w3.org/2000/svg">
<g fill="none" stroke="#b146ff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">
  <path d="M30 45 H230 M190 15 L230 45 L190 75"/>
  <path d="M230 75 H30 M70 45 L30 75 L70 105"/>
</g>
</svg>`;
  return Buffer.from(svg);
}

/** Build a 2-card trade preview image with an arrow between cards. */
export async function buildTradePairImage(left: CardLookup, right: CardLookup): Promise<Buffer> {
  const cardWidth = 760;
  const cardHeight = Math.round(cardWidth * CARD_ASPECT_RATIO);
  const arrowWidth = 260;
  const canvasWidth = PADDING * 4 + cardWidth * 2 + arrowWidth;
  const canvasHeight = cardHeight + PADDING * 2;
  const leftX = PADDING;
  const leftY = PADDING;
  const arrowX = leftX + cardWidth + PADDING;
  const arrowY = Math.round((canvasHeight - 120) / 2);
  const rightX = arrowX + arrowWidth + PADDING;
  const rightY = PADDING;

  const leftUrl = getCardImageUrl(left);
  const rightUrl = getCardImageUrl(right);
  if (!leftUrl || !rightUrl) {
    throw new Error("Trade cards must have images.");
  }

  const [leftBuffer, rightBuffer] = await Promise.all([loadCardImage(leftUrl), loadCardImage(rightUrl)]);
  const [leftResized, rightResized] = await Promise.all([
    sharp(leftBuffer).resize(cardWidth, cardHeight, { fit: "cover" }).toBuffer(),
    sharp(rightBuffer).resize(cardWidth, cardHeight, { fit: "cover" }).toBuffer()
  ]);

  return sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 3,
      background: { r: 20, g: 20, b: 20 }
    }
  })
    .composite([
      { input: leftResized, left: leftX, top: leftY },
      { input: rightResized, left: rightX, top: rightY },
      { input: buildTradeArrow(), left: arrowX, top: arrowY }
    ])
    .webp({ quality: 92 })
    .toBuffer();
}
