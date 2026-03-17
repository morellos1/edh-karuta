export const COLOR_CIRCLE_BY_SYMBOL: Record<string, string> = {
  W: "⚪",
  U: "🔵",
  B: "⚫",
  R: "🔴",
  G: "🟢"
};

const UNCOLORED_CIRCLE = "💿";
const COLOR_ORDER = ["W", "U", "B", "R", "G"] as const;
/** Emoji padding for absent color slots — same visual width as color circle emojis in Discord. */
const COLOR_PAD_CHAR = "▪️";

export function formatRarity(rarity: string | null | undefined): string {
  if (!rarity) {
    return "Unknown";
  }
  return rarity
    .split("_")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

/** Base price as gold (USD × 100), no condition multiplier. Falls back to EUR converted if USD is missing. */
export function formatBaseGold(usd: string | null | undefined, eur?: string | null): string {
  if (usd) {
    const parsed = Number(usd);
    if (Number.isFinite(parsed)) return `${Math.round(parsed * 100)} gold`;
  }
  if (eur) {
    const parsed = Number(eur);
    if (Number.isFinite(parsed)) return `${Math.round(parsed * EUR_TO_USD * 100)} gold`;
  }
  return "N/A";
}

export function formatColorCircles(colors: string | null | undefined): string {
  if (!colors) {
    return UNCOLORED_CIRCLE;
  }
  const symbols = colors
    .split(",")
    .map((token) => token.trim().toUpperCase())
    .filter(Boolean);
  if (!symbols.length) {
    return UNCOLORED_CIRCLE;
  }
  return symbols.map((symbol) => COLOR_CIRCLE_BY_SYMBOL[symbol] ?? UNCOLORED_CIRCLE).join(" ");
}

/** For collection list: 5 WUBRG slots — color circle or ▪️ per slot. All emojis render at equal width. */
export function formatColorCollectionLine(colors: string | null | undefined): string {
  if (!colors) {
    return UNCOLORED_CIRCLE + COLOR_PAD_CHAR.repeat(4);
  }
  const set = new Set(
    colors
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

/** Pick the best available image URL from a card record, preferring PNG. */
export function getCardImageUrl(card: {
  imagePng: string | null;
  imageLarge: string | null;
  imageNormal: string | null;
  imageSmall: string | null;
}): string | null {
  return card.imagePng ?? card.imageLarge ?? card.imageNormal ?? card.imageSmall;
}

/** Fixed EUR → USD conversion rate. */
export const EUR_TO_USD = 1.15;

/** Resolve the base USD price for a card, falling back to cheapest print or default. */
export async function resolveBasePrice(
  cardUsdPrice: string | null,
  cardName: string,
  cardEurPrice?: string | null
): Promise<number> {
  if (cardUsdPrice != null && Number.isFinite(Number(cardUsdPrice))) {
    return Number(cardUsdPrice);
  }
  if (cardEurPrice != null && Number.isFinite(Number(cardEurPrice))) {
    return Math.round(Number(cardEurPrice) * EUR_TO_USD * 100) / 100;
  }
  const { getCheapestPrintPricesByNames, getDefaultBasePriceUsd } = await import("../repositories/cardRepo.js");
  const priceMap = await getCheapestPrintPricesByNames([cardName]);
  return priceMap.get(cardName) ?? getDefaultBasePriceUsd();
}

export function conditionToStars(condition: string | null | undefined): string {
  const c = (condition ?? "good").toLowerCase();
  if (c === "poor") return "★☆☆";
  if (c === "mint") return "★★★";
  return "★★☆";
}
