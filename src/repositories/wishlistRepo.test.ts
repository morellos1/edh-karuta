import test from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../db.js";
import { findWishlistWatchers } from "./wishlistRepo.js";

test("findWishlistWatchers returns watchers for matching cards", async () => {
  const unique = Date.now().toString();
  const guildId = `guild-wl-${unique}`;
  const userId = `user-wl-${unique}`;
  const cardName = "Sol Ring";

  try {
    await prisma.wishlist.create({
      data: { userId, guildId, cardName }
    });

    const result = await findWishlistWatchers(guildId, [cardName, "Lightning Bolt"]);
    assert.equal(result.size, 1);
    assert.deepEqual(result.get(cardName), [userId]);
  } finally {
    await prisma.wishlist.deleteMany({ where: { guildId } });
    await prisma.$disconnect();
  }
});

test("findWishlistWatchers returns empty map for different guild", async () => {
  const unique = Date.now().toString();
  const guildId = `guild-wl-${unique}`;
  const userId = `user-wl-${unique}`;

  try {
    await prisma.wishlist.create({
      data: { userId, guildId, cardName: "Sol Ring" }
    });

    const result = await findWishlistWatchers("other-guild", ["Sol Ring"]);
    assert.equal(result.size, 0);
  } finally {
    await prisma.wishlist.deleteMany({ where: { guildId } });
    await prisma.$disconnect();
  }
});

test("findWishlistWatchers groups multiple watchers correctly", async () => {
  const unique = Date.now().toString();
  const guildId = `guild-wl-${unique}`;
  const userA = `userA-${unique}`;
  const userB = `userB-${unique}`;

  try {
    await prisma.wishlist.createMany({
      data: [
        { userId: userA, guildId, cardName: "Sol Ring" },
        { userId: userB, guildId, cardName: "Sol Ring" },
        { userId: userA, guildId, cardName: "Lightning Bolt" }
      ]
    });

    const result = await findWishlistWatchers(guildId, [
      "Sol Ring",
      "Lightning Bolt",
      "Island"
    ]);

    assert.equal(result.size, 2);
    const solWatchers = result.get("Sol Ring") ?? [];
    assert.equal(solWatchers.length, 2);
    assert.ok(solWatchers.includes(userA));
    assert.ok(solWatchers.includes(userB));
    assert.deepEqual(result.get("Lightning Bolt"), [userA]);
  } finally {
    await prisma.wishlist.deleteMany({ where: { guildId } });
    await prisma.$disconnect();
  }
});

test("findWishlistWatchers handles card names with question marks", async () => {
  const unique = Date.now().toString();
  const guildId = `guild-wl-${unique}`;
  const userId = `user-wl-${unique}`;
  // Real MTG card name containing a question mark
  const cardName = "Who // What // When // Where // Why";

  try {
    await prisma.wishlist.create({
      data: { userId, guildId, cardName }
    });

    const result = await findWishlistWatchers(guildId, [cardName]);
    assert.equal(result.size, 1);
    assert.deepEqual(result.get(cardName), [userId]);
  } finally {
    await prisma.wishlist.deleteMany({ where: { guildId } });
    await prisma.$disconnect();
  }
});

test("findWishlistWatchers handles case-insensitive matching", async () => {
  const unique = Date.now().toString();
  const guildId = `guild-wl-${unique}`;
  const userId = `user-wl-${unique}`;

  try {
    await prisma.wishlist.create({
      data: { userId, guildId, cardName: "Lightning Bolt" }
    });

    // Query with different casing
    const result = await findWishlistWatchers(guildId, ["lightning bolt"]);
    assert.equal(result.size, 1);
  } finally {
    await prisma.wishlist.deleteMany({ where: { guildId } });
    await prisma.$disconnect();
  }
});
