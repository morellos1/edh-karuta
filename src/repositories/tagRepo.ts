import { prisma } from "../db.js";

export async function createTag(userId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const existing = await findTagByUserAndName(userId, trimmed);
  if (existing) return null;
  return prisma.tag
    .create({
      data: { userId, name: trimmed },
      select: { id: true, name: true }
    })
    .catch(() => null);
}

export async function findTagByUserAndName(userId: string, name: string) {
  return prisma.tag.findUnique({
    where: {
      userId_name: { userId, name: name.trim() }
    }
  });
}

export async function deleteTag(userId: string, name: string) {
  const tag = await findTagByUserAndName(userId, name.trim());
  if (!tag) return false;
  await prisma.tag.delete({ where: { id: tag.id } });
  return true;
}

export async function renameTag(userId: string, oldName: string, newName: string) {
  const trimmedOld = oldName.trim();
  const trimmedNew = newName.trim();
  if (!trimmedOld || !trimmedNew || trimmedOld === trimmedNew) return null;
  const tag = await findTagByUserAndName(userId, trimmedOld);
  if (!tag) return null;
  const existing = await findTagByUserAndName(userId, trimmedNew);
  if (existing) return null;
  return prisma.tag.update({
    where: { id: tag.id },
    data: { name: trimmedNew },
    select: { id: true, name: true }
  });
}

export async function getTagsByUserId(userId: string, page: number = 1, pageSize: number = 20) {
  const skip = (Math.max(1, page) - 1) * pageSize;
  const [tags, total] = await Promise.all([
    prisma.tag.findMany({
      where: { userId },
      orderBy: { name: "asc" },
      skip,
      take: pageSize,
      include: {
        _count: { select: { userCardTags: true } }
      }
    }),
    prisma.tag.count({ where: { userId } })
  ]);
  return {
    tags: tags.map((t) => ({ id: t.id, name: t.name, isFavorite: t.isFavorite, cardCount: t._count.userCardTags })),
    total,
    page: Math.max(1, page),
    totalPages: Math.max(1, Math.ceil(total / pageSize))
  };
}

export async function addCardToTag(userId: string, userCardId: number, tagName: string) {
  const tag = await findTagByUserAndName(userId, tagName.trim());
  if (!tag) return { ok: false as const, reason: "tag_not_found" };
  const userCard = await prisma.userCard.findUnique({
    where: { id: userCardId },
    select: { userId: true }
  });
  if (!userCard || userCard.userId !== userId) return { ok: false as const, reason: "card_not_owned" };
  await prisma.userCardTag.upsert({
    where: {
      userCardId_tagId: { userCardId, tagId: tag.id }
    },
    create: { userCardId, tagId: tag.id },
    update: {}
  });
  return { ok: true as const };
}

export async function removeCardFromTag(userId: string, userCardId: number, tagName: string) {
  const tag = await findTagByUserAndName(userId, tagName.trim());
  if (!tag) return { ok: false as const, reason: "tag_not_found" };
  const userCard = await prisma.userCard.findUnique({
    where: { id: userCardId },
    select: { userId: true }
  });
  if (!userCard || userCard.userId !== userId) return { ok: false as const, reason: "card_not_owned" };
  await prisma.userCardTag.deleteMany({
    where: { userCardId, tagId: tag.id }
  });
  return { ok: true as const };
}

export async function removeAllTagsFromCard(userId: string, userCardId: number) {
  const userCard = await prisma.userCard.findUnique({
    where: { id: userCardId },
    select: { userId: true }
  });
  if (!userCard || userCard.userId !== userId) return false;
  await prisma.userCardTag.deleteMany({ where: { userCardId } });
  return true;
}

export async function addCardsToTag(userId: string, userCardIds: number[], tagName: string) {
  const tag = await findTagByUserAndName(userId, tagName.trim());
  if (!tag) return { ok: false as const, reason: "tag_not_found" as const, tagged: 0, failed: 0 };

  let tagged = 0;
  let failed = 0;
  for (const userCardId of userCardIds) {
    const userCard = await prisma.userCard.findUnique({
      where: { id: userCardId },
      select: { userId: true }
    });
    if (!userCard || userCard.userId !== userId) {
      failed++;
      continue;
    }
    await prisma.userCardTag.upsert({
      where: { userCardId_tagId: { userCardId, tagId: tag.id } },
      create: { userCardId, tagId: tag.id },
      update: {}
    });
    tagged++;
  }
  return { ok: true as const, tagged, failed };
}

/** Remove all tag associations from a card (e.g. when it is traded/given away). */
export async function stripTagsFromUserCard(userCardId: number) {
  await prisma.userCardTag.deleteMany({ where: { userCardId } });
}

/** Resolve tag name to tag id for the user; returns null if not found. */
export async function getTagIdForUser(userId: string, tagName: string): Promise<number | null> {
  const tag = await findTagByUserAndName(userId, tagName.trim());
  return tag?.id ?? null;
}

/** Set a tag's favorite status. Returns false if tag not found or already in desired state. */
export async function setTagFavorite(userId: string, tagName: string, isFavorite: boolean): Promise<{ ok: boolean; reason?: string }> {
  const tag = await findTagByUserAndName(userId, tagName.trim());
  if (!tag) return { ok: false, reason: "tag_not_found" };
  if (tag.isFavorite === isFavorite) return { ok: false, reason: isFavorite ? "already_favorite" : "not_favorite" };
  if (isFavorite) {
    const count = await getFavoriteTagCount(userId);
    if (count >= 5) return { ok: false, reason: "limit_reached" };
  }
  await prisma.tag.update({ where: { id: tag.id }, data: { isFavorite } });
  return { ok: true };
}

/** Count how many tags the user has marked as favorite. */
export async function getFavoriteTagCount(userId: string): Promise<number> {
  return prisma.tag.count({ where: { userId, isFavorite: true } });
}

/** Check if a specific user card is in any of the user's favorited tags. */
export async function isCardInFavoriteTag(userId: string, userCardId: number): Promise<boolean> {
  const result = await prisma.userCardTag.findFirst({
    where: {
      userCardId,
      tag: { userId, isFavorite: true }
    }
  });
  return result !== null;
}

/** Get the set of userCardIds that are in any favorited tag for a user. */
export async function getFavoriteCardIds(userId: string): Promise<Set<number>> {
  const entries = await prisma.userCardTag.findMany({
    where: {
      tag: { userId, isFavorite: true }
    },
    select: { userCardId: true }
  });
  return new Set(entries.map(e => e.userCardId));
}

/** Check if a tag is favorited. */
export async function isTagFavorited(userId: string, tagName: string): Promise<boolean> {
  const tag = await findTagByUserAndName(userId, tagName.trim());
  return tag?.isFavorite ?? false;
}
