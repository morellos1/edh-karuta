import { prisma } from "../db.js";

const PAGE_SIZE = 10;
const ALBUM_PAGE_SIZE = 9;

export type CollectionSort = "recent" | "color" | "price_asc" | "price_desc" | "rarity";

export async function getCollectionPage(
  userId: string,
  page: number,
  sort: CollectionSort = "recent",
  pageSize: number = PAGE_SIZE,
  tagId?: number | null
) {
  const safePage = Math.max(1, page);

  const baseWhere = tagId != null
    ? {
        userId,
        tags: { some: { tagId } }
      }
    : { userId };

  const [total, allEntries] = await Promise.all([
    prisma.userCard.count({ where: baseWhere }),
    prisma.userCard.findMany({
      where: baseWhere,
      include: { card: true },
      orderBy: { claimedAt: "desc" }
    })
  ]);

  let sorted = allEntries;
  if (sort === "color") {
    sorted = [...allEntries].sort((a, b) => {
      const ca = (a.card.colorIdentity ?? "").toLowerCase();
      const cb = (b.card.colorIdentity ?? "").toLowerCase();
      return ca.localeCompare(cb);
    });
  } else if (sort === "price_asc" || sort === "price_desc") {
    const { getConditionMultiplier } = await import("../services/conditionService.js");
    const { getCheapestPrintPricesByNames, getDefaultBasePriceUsd } = await import("./cardRepo.js");
    const namesNeedingPrice = [...new Set(allEntries.filter((e) => !e.card.usdPrice || !Number.isFinite(Number(e.card.usdPrice))).map((e) => e.card.name))];
    const priceMap = namesNeedingPrice.length ? await getCheapestPrintPricesByNames(namesNeedingPrice) : new Map<string, number>();
    const defaultBase = getDefaultBasePriceUsd();
    const mult = sort === "price_desc" ? -1 : 1;
    sorted = [...allEntries].sort((a, b) => {
      const baseA = (a.card.usdPrice != null && Number.isFinite(Number(a.card.usdPrice)))
        ? Number(a.card.usdPrice)
        : (priceMap.get(a.card.name) ?? defaultBase);
      const baseB = (b.card.usdPrice != null && Number.isFinite(Number(b.card.usdPrice)))
        ? Number(b.card.usdPrice)
        : (priceMap.get(b.card.name) ?? defaultBase);
      const adjA = baseA * getConditionMultiplier(a.condition);
      const adjB = baseB * getConditionMultiplier(b.condition);
      return mult * (adjA - adjB);
    });
  } else if (sort === "rarity") {
    const { raritySortKey } = await import("../utils/cardFormatting.js");
    sorted = [...allEntries].sort((a, b) => {
      return raritySortKey(b.card.rarity) - raritySortKey(a.card.rarity);
    });
  }

  const start = (safePage - 1) * pageSize;
  const cards = sorted.slice(start, start + pageSize);

  return {
    total,
    page: safePage,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    cards
  };
}

/** All user cards with card for export (no pagination). */
export async function getAllForExport(userId: string) {
  return prisma.userCard.findMany({
    where: { userId },
    include: { card: true },
    orderBy: { claimedAt: "desc" }
  });
}

/** Format collection entries as Moxfield list: "1 Card Name (SET) collectorNumber" per line, grouped by (name, setCode, collectorNumber). */
export function formatCollectionAsMoxfield(entries: Array<{ card: { name: string; setCode: string; collectorNumber: string } }>): string {
  const byKey = new Map<string, number>();
  for (const e of entries) {
    const key = `${e.card.name}\t${e.card.setCode}\t${e.card.collectorNumber}`;
    byKey.set(key, (byKey.get(key) ?? 0) + 1);
  }
  const lines = Array.from(byKey.entries())
    .map(([key, count]) => {
      const [name, setCode, collectorNumber] = key.split("\t");
      return `${count} ${name} (${setCode.toUpperCase()}) ${collectorNumber}`;
    })
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  return lines.join("\n");
}
