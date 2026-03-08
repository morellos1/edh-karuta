const COLOR_CIRCLE_BY_SYMBOL: Record<string, string> = {
  W: "⚪",
  U: "🔵",
  B: "⚫",
  R: "🔴",
  G: "🟢"
};

const UNCOLORED_CIRCLE = "💿";
const COLOR_ORDER = ["W", "U", "B", "R", "G"] as const;
/** Invisible character for collection color padding (same width in Discord backticks). */
const COLOR_PAD_CHAR = "\u3164"; // HANGUL FILLER ㅤ

export function formatRarity(rarity: string | null | undefined): string {
  if (!rarity) {
    return "Unknown";
  }
  return rarity
    .split("_")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatUsd(usd: string | null | undefined): string {
  if (!usd) {
    return "N/A";
  }
  const parsed = Number(usd);
  return Number.isFinite(parsed) ? `$${parsed.toFixed(2)}` : "N/A";
}

/** Base price as gold (USD × 100), no condition multiplier. */
export function formatBaseGold(usd: string | null | undefined): string {
  if (!usd) return "N/A";
  const parsed = Number(usd);
  if (!Number.isFinite(parsed)) return "N/A";
  return `${Math.round(parsed * 100)} gold`;
}

export function formatColorCircles(colorIdentity: string | null | undefined): string {
  if (!colorIdentity) {
    return UNCOLORED_CIRCLE;
  }
  const symbols = colorIdentity
    .split(",")
    .map((token) => token.trim().toUpperCase())
    .filter(Boolean);
  if (!symbols.length) {
    return UNCOLORED_CIRCLE;
  }
  return symbols.map((symbol) => COLOR_CIRCLE_BY_SYMBOL[symbol] ?? UNCOLORED_CIRCLE).join(" ");
}

export function formatColorColumn(colorIdentity: string | null | undefined): string {
  if (!colorIdentity) {
    return `${UNCOLORED_CIRCLE} . . . .`;
  }
  const set = new Set(
    colorIdentity
      .split(",")
      .map((token) => token.trim().toUpperCase())
      .filter(Boolean)
  );
  if (!set.size) {
    return `${UNCOLORED_CIRCLE} . . . .`;
  }
  return COLOR_ORDER.map((symbol) => (set.has(symbol) ? COLOR_CIRCLE_BY_SYMBOL[symbol] : ".")).join(" ");
}

/** For collection list: 5 slots — circle or ㅤ per WUBRG. Backticks on Discord make each char same width. */
export function formatColorCollectionLine(colorIdentity: string | null | undefined): string {
  if (!colorIdentity) {
    return UNCOLORED_CIRCLE + COLOR_PAD_CHAR.repeat(4);
  }
  const set = new Set(
    colorIdentity
      .split(",")
      .map((token) => token.trim().toUpperCase())
      .filter(Boolean)
  );
  if (!set.size) {
    return UNCOLORED_CIRCLE + COLOR_PAD_CHAR.repeat(4);
  }
  return COLOR_ORDER.map((symbol) => (set.has(symbol) ? COLOR_CIRCLE_BY_SYMBOL[symbol] : COLOR_PAD_CHAR))
    .join("");
}

/** Fixed-width ASCII for collection table alignment (W/U/B/R/G or -). Always 5 chars. */
export function formatColorColumnPlain(colorIdentity: string | null | undefined): string {
  if (!colorIdentity) {
    return "-    "; // colorless, 5 chars
  }
  const set = new Set(
    colorIdentity
      .split(",")
      .map((token) => token.trim().toUpperCase())
      .filter(Boolean)
  );
  if (!set.size) {
    return "-    ";
  }
  const s = COLOR_ORDER.map((symbol) => (set.has(symbol) ? symbol : "-")).join("");
  return s.padEnd(5, " ").slice(0, 5);
}

const RARITY_ORDER: Record<string, number> = { common: 0, uncommon: 1, rare: 2, mythic: 3 };
export function raritySortKey(rarity: string | null | undefined): number {
  if (!rarity) return -1;
  return RARITY_ORDER[rarity.toLowerCase()] ?? -1;
}

/** Pick the best available image URL from a card record, preferring PNG. */
export function getCardImageUrl(card: {
  imagePng: string | null;
  imageLarge: string | null;
  imageNormal: string | null;
  imageSmall: string | null;
}): string | null {
  return card.imagePng ?? card.imageLarge ?? card.imageNormal ?? card.imageSmall;
}

/** Resolve the base USD price for a card, falling back to cheapest print or default. */
export async function resolveBasePrice(
  cardUsdPrice: string | null,
  cardName: string
): Promise<number> {
  if (cardUsdPrice != null && Number.isFinite(Number(cardUsdPrice))) {
    return Number(cardUsdPrice);
  }
  const { getCheapestPrintPricesByNames, getDefaultBasePriceUsd } = await import("../repositories/cardRepo.js");
  const priceMap = await getCheapestPrintPricesByNames([cardName]);
  return priceMap.get(cardName) ?? getDefaultBasePriceUsd();
}

export function conditionToStars(condition: string | null | undefined): string {
  const c = (condition ?? "good").toLowerCase();
  if (c === "poor") return "★☆☆☆";
  if (c === "mint") return "★★★★";
  return "★★★☆";
}
