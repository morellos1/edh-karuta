import axios from "axios";
import sharp from "sharp";
import type { CardLookup } from "../repositories/cardRepo.js";

const MAX_CANVAS_WIDTH = 4096;
const PADDING = 12;
const CARD_ASPECT_RATIO = 1.39375;

/** Card dimensions for one row of 3 cards (same as drop). */
function getDropRowCardDimensions() {
  const columns = 3;
  const cardWidth = Math.floor((MAX_CANVAS_WIDTH - (columns + 1) * PADDING) / columns);
  const cardHeight = Math.round(cardWidth * CARD_ASPECT_RATIO);
  return { cardWidth, cardHeight };
}

async function loadCardImage(url: string): Promise<Buffer> {
  const response = await axios.get<ArrayBuffer>(url, {
    responseType: "arraybuffer",
    timeout: 15000
  });
  return Buffer.from(response.data);
}

export async function buildDropCollage(cards: CardLookup[]): Promise<Buffer> {
  const columns = cards.length;
  const cardWidth = Math.floor((MAX_CANVAS_WIDTH - (columns + 1) * PADDING) / columns);
  const cardHeight = Math.round(cardWidth * CARD_ASPECT_RATIO);
  const canvasWidth = PADDING + columns * (cardWidth + PADDING);
  const canvasHeight = cardHeight + PADDING * 2;

  const composites: sharp.OverlayOptions[] = [];

  for (let i = 0; i < cards.length; i += 1) {
    const card = cards[i];
    const x = PADDING + i * (cardWidth + PADDING);
    const y = PADDING;
    const imageUrl = card.imagePng ?? card.imageLarge ?? card.imageNormal ?? card.imageSmall;

    if (!imageUrl) {
      throw new Error(`Card ${card.name} is missing image URLs.`);
    }

    const imageBuffer = await loadCardImage(imageUrl);
    const resized = await sharp(imageBuffer)
      .resize(cardWidth, cardHeight, { fit: "cover" })
      .toBuffer();

    composites.push({
      input: resized,
      left: x,
      top: y
    });
  }

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

  const composites: sharp.OverlayOptions[] = [];

  for (let i = 0; i < count; i++) {
    const card = cards[i];
    const imageUrl = card.imagePng ?? card.imageLarge ?? card.imageNormal ?? card.imageSmall;
    const col = i % GRID_COLS;
    const row = Math.floor(i / GRID_COLS);
    const x = GRID_PADDING + col * (cardWidth + GRID_PADDING);
    const y = GRID_PADDING + row * (cardHeight + GRID_PADDING);

    if (imageUrl) {
      try {
        const imageBuffer = await loadCardImage(imageUrl);
        const resized = await sharp(imageBuffer)
          .resize(cardWidth, cardHeight, { fit: "cover" })
          .toBuffer();
        composites.push({ input: resized, left: x, top: y });
      } catch {
        // skip card if image fails to load
      }
    }
  }

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

  const cardWidth = Math.floor(
    (MAX_CANVAS_WIDTH - (MARKET_COLS + 1) * MARKET_PADDING) / MARKET_COLS
  );
  const cardHeight = Math.round(cardWidth * CARD_ASPECT_RATIO);
  const canvasWidth = MARKET_PADDING + MARKET_COLS * (cardWidth + MARKET_PADDING);
  const canvasHeight = MARKET_PADDING + MARKET_ROWS * (cardHeight + MARKET_PADDING);

  const composites: sharp.OverlayOptions[] = [];

  for (let i = 0; i < count; i++) {
    const card = cards[i];
    const imageUrl = card.imagePng ?? card.imageLarge ?? card.imageNormal ?? card.imageSmall;
    const col = i % MARKET_COLS;
    const row = Math.floor(i / MARKET_COLS);
    const x = MARKET_PADDING + col * (cardWidth + MARKET_PADDING);
    const y = MARKET_PADDING + row * (cardHeight + MARKET_PADDING);

    if (!imageUrl) {
      continue;
    }

    try {
      const imageBuffer = await loadCardImage(imageUrl);
      const resized = await sharp(imageBuffer)
        .resize(cardWidth, cardHeight, { fit: "cover" })
        .toBuffer();
      composites.push({ input: resized, left: x, top: y });

      composites.push({
        input: buildLetterBadge(labels[i]),
        left: x + 10,
        top: y + 10
      });
    } catch {
      // skip card if image fails to load
    }
  }

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

  const leftUrl = left.imagePng ?? left.imageLarge ?? left.imageNormal ?? left.imageSmall;
  const rightUrl = right.imagePng ?? right.imageLarge ?? right.imageNormal ?? right.imageSmall;
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
