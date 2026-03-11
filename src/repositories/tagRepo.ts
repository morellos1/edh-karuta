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
    tags: tags.map((t) => ({ id: t.id, name: t.name, cardCount: t._count.userCardTags })),
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
