import test from "node:test";
import assert from "node:assert/strict";
import { pickNextClaimIndex } from "./dropService.js";
import { prisma } from "../db.js";

test("claim arbitration prioritizes dropper when present", () => {
  const queue = [{ userId: "userA" }, { userId: "dropper" }, { userId: "userB" }];
  const index = pickNextClaimIndex(queue, "dropper");
  assert.equal(index, 1);
});

test("claim arbitration falls back to first claim", () => {
  const queue = [{ userId: "userA" }, { userId: "userB" }];
  const index = pickNextClaimIndex(queue, "dropper");
  assert.equal(index, 0);
});

test("one-per-drop persistence enforces unique user+drop claim", async () => {
  const unique = Date.now().toString();
  let cardId = 0;
  let dropId = 0;

  try {
    const card = await prisma.card.create({
      data: {
        scryfallId: `test-card-${unique}`,
        name: "Test Card",
        setCode: "tst",
        collectorNumber: unique,
        isBasicLand: false,
        isCommanderLegal: true
      }
    });
    cardId = card.id;

    const drop = await prisma.drop.create({
      data: {
        guildId: "guild-test",
        channelId: "channel-test",
        dropperUserId: "dropper-test",
        expiresAt: new Date(Date.now() + 60_000)
      }
    });
    dropId = drop.id;

    await prisma.userCard.create({
      data: {
        displayId: `test1-${unique}`.slice(0, 6),
        userId: "collector-test",
        cardId,
        dropId
      }
    });

    await assert.rejects(() =>
      prisma.userCard.create({
        data: {
          displayId: `test2-${unique}`.slice(0, 6),
          userId: "collector-test",
          cardId,
          dropId
        }
      })
    );
  } finally {
    if (dropId) {
      await prisma.userCard.deleteMany({ where: { dropId } });
      await prisma.drop.delete({ where: { id: dropId } });
    }
    if (cardId) {
      await prisma.card.delete({ where: { id: cardId } });
    }
    await prisma.$disconnect();
  }
});
