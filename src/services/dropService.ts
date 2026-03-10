import type { CardLookup } from "../repositories/cardRepo.js";
import { prisma } from "../db.js";
import { computeRemainingCooldownMs } from "./cooldownService.js";
import { pickRandomCondition } from "./conditionService.js";
import { generateDisplayId } from "../utils/displayId.js";
import { createAsyncLock } from "../utils/asyncLock.js";
import type { Prisma } from "@prisma/client";

type ClaimSuccess = {
  ok: true;
  slotIndex: number;
  cardId: number;
  cardName: string;
  dropId: number;
  claimedByUserId: string;
  displayId: string;
  condition: string;
};

type ClaimFailure = {
  ok: false;
  reason:
    | "drop_expired"
    | "slot_taken"
    | "already_claimed_in_drop"
    | "cooldown"
    | "invalid_slot"
    | "not_found";
  remainingMs?: number;
};

export type ClaimResult = ClaimSuccess | ClaimFailure;

type ClaimRequest = {
  dropId: number;
  slotIndex: number;
  userId: string;
  cooldownSeconds: number;
  resolve: (result: ClaimResult) => void;
};

const queues = new Map<number, ClaimRequest[]>();
const processing = new Set<number>();
const debounced = new Set<number>();
const DROP_PRIORITY_WINDOW_MS = 120;

/**
 * Per-user mutex to serialize claim processing across different drops.
 * Without this, a user clicking claim on two regular drops simultaneously
 * can race through cooldown checks (each transaction sees the same "last claim").
 */
const withUserClaimLock = createAsyncLock();

export function pickNextClaimIndex(
  queue: Array<{ userId: string }>,
  dropperUserId: string
): number {
  const dropperIdx = queue.findIndex((req) => req.userId === dropperUserId);
  return dropperIdx >= 0 ? dropperIdx : 0;
}

async function processQueue(dropId: number) {
  if (processing.has(dropId)) {
    return;
  }

  processing.add(dropId);

  try {
    while ((queues.get(dropId)?.length ?? 0) > 0) {
      const queue = queues.get(dropId)!;
      const drop = await prisma.drop.findUnique({
        where: { id: dropId },
        select: { dropperUserId: true }
      });

      if (!drop) {
        for (const req of queue.splice(0, queue.length)) {
          req.resolve({ ok: false, reason: "not_found" });
        }
        break;
      }

      const nextIndex = pickNextClaimIndex(queue, drop.dropperUserId);
      const request = nextIndex >= 0 ? queue.splice(nextIndex, 1)[0] : queue.shift()!;
      const result = await withUserClaimLock(request.userId, () =>
        claimSlotTransactional(
          request.dropId,
          request.slotIndex,
          request.userId,
          request.cooldownSeconds
        )
      );
      request.resolve(result);
    }
  } finally {
    processing.delete(dropId);
    queues.delete(dropId);
  }
}

async function claimSlotTransactional(
  dropId: number,
  slotIndex: number,
  userId: string,
  cooldownSeconds: number
): Promise<ClaimResult> {
  const fail = (
    reason: ClaimFailure["reason"],
    remainingMs?: number
  ): ClaimFailure => ({
    ok: false,
    reason,
    ...(remainingMs ? { remainingMs } : {})
  });
  const success = (payload: Omit<ClaimSuccess, "ok">): ClaimSuccess => ({
    ok: true,
    ...payload
  });

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const drop = await tx.drop.findUnique({
      where: { id: dropId },
      select: { id: true, expiresAt: true, dropType: true }
    });

    if (!drop) {
      return fail("not_found");
    }

    if (drop.expiresAt.getTime() <= Date.now()) {
      return fail("drop_expired");
    }

    const slot = await tx.dropSlot.findUnique({
      where: {
        dropId_slotIndex: {
          dropId,
          slotIndex
        }
      },
      include: { card: true }
    });

    if (!slot) {
      return fail("invalid_slot");
    }

    if (slot.claimedByUserId) {
      return fail("slot_taken");
    }

    const existingClaim = await tx.userCard.findFirst({
      where: { userId, dropId },
      select: { id: true }
    });
    if (existingClaim) {
      return fail("already_claimed_in_drop");
    }

    const isSpecialDrop = drop.dropType !== "regular";

    if (!isSpecialDrop) {
      const cooldownRecord = await tx.claimCooldown.findUnique({
        where: { userId },
        select: { lastClaimedAt: true }
      });

      const remainingMs = cooldownRecord
        ? computeRemainingCooldownMs(cooldownRecord.lastClaimedAt.getTime(), cooldownSeconds)
        : 0;
      if (remainingMs > 0) {
        return fail("cooldown", remainingMs);
      }
    }

    await tx.dropSlot.update({
      where: {
        dropId_slotIndex: {
          dropId,
          slotIndex
        }
      },
      data: {
        claimedByUserId: userId,
        claimedAt: new Date()
      }
    });

    const condition = pickRandomCondition();
    let displayId = generateDisplayId();
    for (let attempt = 0; attempt < 10; attempt++) {
      const existing = await tx.userCard.findUnique({ where: { displayId }, select: { id: true } });
      if (!existing) break;
      displayId = generateDisplayId();
    }

    await tx.userCard.create({
      data: {
        displayId,
        userId,
        cardId: slot.cardId,
        dropId,
        condition
      }
    });

    const now = new Date();
    await tx.claimCooldown.upsert({
      where: { userId },
      update: { lastClaimedAt: now },
      create: { userId, lastClaimedAt: now }
    });

    return success({
      slotIndex,
      cardId: slot.cardId,
      cardName: slot.card.name,
      dropId,
      claimedByUserId: userId,
      displayId,
      condition
    });
  });
}

export async function createDropRecord(params: {
  guildId: string;
  channelId: string;
  dropperUserId: string;
  expiresAt: Date;
  cards: CardLookup[];
  dropType?: string;
}) {
  const { guildId, channelId, dropperUserId, expiresAt, cards, dropType } = params;
  return prisma.drop.create({
    data: {
      guildId,
      channelId,
      dropperUserId,
      dropType: dropType ?? "regular",
      expiresAt,
      slots: {
        create: cards.map((card, idx) => ({
          slotIndex: idx,
          cardId: card.id
        }))
      }
    },
    include: {
      slots: {
        include: {
          card: true
        },
        orderBy: { slotIndex: "asc" }
      }
    }
  });
}

export async function attachDropMessage(dropId: number, messageId: string) {
  await prisma.drop.update({
    where: { id: dropId },
    data: { messageId }
  });
}

export async function getDropById(dropId: number) {
  return prisma.drop.findUnique({
    where: { id: dropId },
    include: {
      slots: {
        include: { card: true },
        orderBy: { slotIndex: "asc" }
      }
    }
  });
}

export async function submitClaim(params: {
  dropId: number;
  slotIndex: number;
  userId: string;
  cooldownSeconds: number;
}): Promise<ClaimResult> {
  const { dropId, slotIndex, userId, cooldownSeconds } = params;

  return new Promise<ClaimResult>((resolve) => {
    const queue = queues.get(dropId) ?? [];
    queue.push({ dropId, slotIndex, userId, cooldownSeconds, resolve });
    queues.set(dropId, queue);

    if (!debounced.has(dropId)) {
      debounced.add(dropId);
      setTimeout(() => {
        debounced.delete(dropId);
        void processQueue(dropId);
      }, DROP_PRIORITY_WINDOW_MS);
    }
  });
}

export async function markDropResolved(dropId: number) {
  await prisma.drop.update({
    where: { id: dropId },
    data: { resolvedAt: new Date() }
  });
}
