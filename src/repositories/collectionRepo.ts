import { prisma } from "../db.js";
import { CONDITION_MULTIPLIERS } from "../config.js";

const PAGE_SIZE = 10;

/** Subset of Card fields needed for collection display, export, and grid views. */
const cardSelectCollection = {
  id: true,
  scryfallId: true,
  name: true,
  setCode: true,
  setName: true,
  collectorNumber: true,
  lang: true,
  colors: true,
  colorIdentity: true,
  usdPrice: true,
  eurPrice: true,
  rarity: true,
  imagePng: true,
  imageLarge: true,
  imageNormal: true,
  imageSmall: true,
  manaCost: true,
  typeLine: true,
  oracleText: true,
  power: true,
  toughness: true
} as const;

export type CollectionSort = "recent" | "color" | "color_white" | "color_blue" | "color_black" | "color_red" | "color_green" | "color_uncolored" | "price_asc" | "price_desc" | "rarity";

export async function getCollectionPage(
  userId: string,
  page: number,
  sort: CollectionSort = "recent",
  pageSize: number = PAGE_SIZE,
  tagId?: number | null,
  nameSearch?: string | null,
  typeFilter?: string | null
) {
  const safePage = Math.max(1, page);

  const baseWhere: Record<string, unknown> = tagId != null
    ? {
        userId,
        tags: { some: { tagId } }
      }
    : { userId };

  if (nameSearch) {
    baseWhere.card = {
      ...(baseWhere.card as Record<string, unknown> ?? {}),
      name: { contains: nameSearch }
    };
  }
  if (typeFilter) {
    if (typeFilter === "Commander") {
      baseWhere.card = {
        ...(baseWhere.card as Record<string, unknown> ?? {}),
        layout: { notIn: ["flip"] },
        NOT: { typeLine: { contains: "Battle" } },
        OR: [
          { typeLine: { contains: "Legendary" }, AND: { typeLine: { contains: "Creature" } } },
          { typeLine: { contains: "Planeswalker" }, oracleText: { contains: "can be your commander" } },
          { typeLine: { contains: "Legendary" }, AND: { typeLine: { contains: "Vehicle" } }, power: { not: null }, toughness: { not: null } },
          { typeLine: { contains: "Legendary" }, AND: { typeLine: { contains: "Spacecraft" } }, power: { not: null }, toughness: { not: null } }
        ]
      };
    } else {
      baseWhere.card = {
        ...(baseWhere.card as Record<string, unknown> ?? {}),
        typeLine: { contains: typeFilter }
      };
    }
  }

  // Color-specific sorts: put cards containing the target color first (or
  // colorless cards first for "uncolored"), then fall back to color ASC.
  const COLOR_SORT_SYMBOL: Record<string, string | null> = {
    color_white: "W",
    color_blue: "U",
    color_black: "B",
    color_red: "R",
    color_green: "G",
    color_uncolored: null
  };

  // Build extra SQL filter clauses for name search and type filter
  const extraClauses: string[] = [];
  const extraParams: unknown[] = [];
  if (nameSearch) {
    extraClauses.push(`c.name LIKE ?`);
    extraParams.push(`%${nameSearch}%`);
  }
  if (typeFilter) {
    if (typeFilter === "Commander") {
      extraClauses.push(`(c.layout NOT IN ('flip') AND c.typeLine NOT LIKE '%Battle%' AND ((c.typeLine LIKE '%Legendary%' AND c.typeLine LIKE '%Creature%') OR (c.typeLine LIKE '%Planeswalker%' AND c.oracleText LIKE '%can be your commander%') OR (c.typeLine LIKE '%Legendary%' AND c.typeLine LIKE '%Vehicle%' AND c.power IS NOT NULL AND c.toughness IS NOT NULL) OR (c.typeLine LIKE '%Legendary%' AND c.typeLine LIKE '%Spacecraft%' AND c.power IS NOT NULL AND c.toughness IS NOT NULL)))`);
    } else {
      extraClauses.push(`c.typeLine LIKE ?`);
      extraParams.push(`%${typeFilter}%`);
    }
  }
  const extraWhere = extraClauses.length ? ` AND ${extraClauses.join(" AND ")}` : "";

  if (sort in COLOR_SORT_SYMBOL) {
    const symbol = COLOR_SORT_SYMBOL[sort];
    const skip = (safePage - 1) * pageSize;

    const tagJoin = tagId != null
      ? `JOIN UserCardTag uct ON uct.userCardId = uc.id AND uct.tagId = ${Number(tagId)}`
      : "";

    // For a specific color symbol: cards containing that symbol sort first (0),
    // others sort second (1). For "uncolored": cards with NULL/empty colors
    // sort first.
    const orderExpr = symbol != null
      ? `CASE WHEN c.colors IS NOT NULL AND c.colors LIKE '%${symbol}%' THEN 0 ELSE 1 END`
      : `CASE WHEN c.colors IS NULL OR c.colors = '' THEN 0 ELSE 1 END`;

    const [countResult, rows] = await Promise.all([
      prisma.$queryRawUnsafe<{ cnt: number }[]>(
        `SELECT COUNT(*) as cnt FROM UserCard uc JOIN Card c ON c.id = uc.cardId ${tagJoin} WHERE uc.userId = ?${extraWhere}`,
        userId,
        ...extraParams
      ),
      prisma.$queryRawUnsafe<{ id: number }[]>(
        `SELECT uc.id FROM UserCard uc
         JOIN Card c ON c.id = uc.cardId
         ${tagJoin}
         WHERE uc.userId = ?${extraWhere}
         ORDER BY ${orderExpr}, c.colors ASC
         LIMIT ? OFFSET ?`,
        userId,
        ...extraParams,
        pageSize,
        skip
      )
    ]);

    const total = Number(countResult[0]?.cnt ?? 0);
    const ids = rows.map((r) => r.id);

    const cards = ids.length
      ? await prisma.userCard.findMany({
          where: { id: { in: ids } },
          include: { card: { select: cardSelectCollection } }
        }).then((results) => {
          const byId = new Map(results.map((r) => [r.id, r]));
          return ids.map((id) => byId.get(id)!).filter(Boolean);
        })
      : [];

    return {
      total,
      page: safePage,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      cards
    };
  }

  // For sorts that can be handled at DB level, use skip/take to avoid loading
  // the entire collection into memory.
  if (sort === "recent" || sort === "color" || sort === "rarity") {
    const orderBy = sort === "recent"
      ? { claimedAt: "desc" as const }
      : sort === "color"
        ? { card: { colors: "asc" as const } }
        : { card: { rarity: "desc" as const } };

    const skip = (safePage - 1) * pageSize;
    const [total, cards] = await Promise.all([
      prisma.userCard.count({ where: baseWhere }),
      prisma.userCard.findMany({
        where: baseWhere,
        include: { card: { select: cardSelectCollection } },
        orderBy,
        skip,
        take: pageSize
      })
    ]);

    return {
      total,
      page: safePage,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      cards
    };
  }

  // Price sorting: compute effective gold value at the DB level so we can
  // ORDER BY + LIMIT instead of loading every card into memory.
  const { getDefaultBasePriceUsd } = await import("./cardRepo.js");
  const defaultBase = getDefaultBasePriceUsd();

  const poorMult = CONDITION_MULTIPLIERS["poor"] ?? 3;
  const goodMult = CONDITION_MULTIPLIERS["good"] ?? 3;
  const mintMult = CONDITION_MULTIPLIERS["mint"] ?? 3;
  const defaultMult = goodMult;

  const direction = sort === "price_desc" ? "DESC" : "ASC";
  const skip = (safePage - 1) * pageSize;

  // Build tag filter join if needed
  const tagJoin = tagId != null
    ? `JOIN UserCardTag uct ON uct.userCardId = uc.id AND uct.tagId = ${Number(tagId)}`
    : "";

  const [countResult, rows] = await Promise.all([
    prisma.$queryRawUnsafe<{ cnt: number }[]>(
      `SELECT COUNT(*) as cnt FROM UserCard uc JOIN Card c ON c.id = uc.cardId ${tagJoin} WHERE uc.userId = ?${extraWhere}`,
      userId,
      ...extraParams
    ),
    prisma.$queryRawUnsafe<{ id: number }[]>(
      `SELECT uc.id FROM UserCard uc
       JOIN Card c ON c.id = uc.cardId
       ${tagJoin}
       WHERE uc.userId = ?${extraWhere}
       ORDER BY (
         CASE
           WHEN c.usdPrice IS NOT NULL AND CAST(c.usdPrice AS REAL) > 0
             THEN CAST(c.usdPrice AS REAL)
           WHEN c.eurPrice IS NOT NULL AND CAST(c.eurPrice AS REAL) > 0
             THEN ROUND(CAST(c.eurPrice AS REAL) * 1.15, 2)
           ELSE ?
         END
         *
         CASE uc.condition
           WHEN 'poor' THEN ?
           WHEN 'good' THEN ?
           WHEN 'mint' THEN ?
           ELSE ?
         END
       ) ${direction}
       LIMIT ? OFFSET ?`,
      userId,
      ...extraParams,
      defaultBase,
      poorMult,
      goodMult,
      mintMult,
      defaultMult,
      pageSize,
      skip
    )
  ]);

  const total = Number(countResult[0]?.cnt ?? 0);
  const ids = rows.map((r) => r.id);

  // Fetch the full UserCard+Card data for just this page, preserving sort order.
  const cards = ids.length
    ? await prisma.userCard.findMany({
        where: { id: { in: ids } },
        include: { card: { select: cardSelectCollection } }
      }).then((results) => {
        const byId = new Map(results.map((r) => [r.id, r]));
        return ids.map((id) => byId.get(id)!).filter(Boolean);
      })
    : [];

  return {
    total,
    page: safePage,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    cards
  };
}

/** All user cards matching a tag (no pagination). */
export async function getAllCardsByTag(userId: string, tagId: number) {
  return prisma.userCard.findMany({
    where: {
      userId,
      tags: { some: { tagId } }
    },
    include: { card: { select: { name: true, setCode: true, collectorNumber: true, usdPrice: true, eurPrice: true } } },
    orderBy: { claimedAt: "desc" }
  });
}

/** All user cards with card for export (no pagination). */
export async function getAllForExport(userId: string) {
  return prisma.userCard.findMany({
    where: { userId },
    include: { card: { select: { name: true, setCode: true, collectorNumber: true } } },
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
