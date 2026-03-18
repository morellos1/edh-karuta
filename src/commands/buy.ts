import {
  ChatInputCommandInteraction,
  SlashCommandBuilder
} from "discord.js";
import type { SlashCommand } from "./types.js";
import { prisma } from "../db.js";
import { getMarketSlot, getMarketCardsForSlot, MARKET_IDS, type MarketCardId } from "../services/marketService.js";
import { getGold } from "../repositories/inventoryRepo.js";
import { generateDisplayId } from "../utils/displayId.js";
import { gameConfig } from "../config.js";
import { grantExtraClaims, getExtraClaimCount } from "../repositories/extraClaimRepo.js";
import { grantExtraCommanderDrops, getExtraCommanderDropCount } from "../repositories/extraCommanderDropRepo.js";
import { grantExtraLandDrops, getExtraLandDropCount } from "../repositories/extraLandDropRepo.js";
import { isLegendaryCreature } from "../services/clashService.js";
import { rollClashBonuses } from "../services/clashBonusService.js";

function parseMarketId(input: string): MarketCardId | null {
  const upper = input.trim().toUpperCase();
  return MARKET_IDS.includes(upper as MarketCardId) ? (upper as MarketCardId) : null;
}

async function handleBuyExtraClaim(interaction: ChatInputCommandInteraction, quantity: number): Promise<void> {
  const userId = interaction.user.id;
  const unitPrice = gameConfig.toolshop.extraClaimPrice;
  const totalPrice = unitPrice * quantity;
  const balance = await getGold(userId);

  if (balance < totalPrice) {
    await interaction.reply({
      content: `You need **${totalPrice.toLocaleString()}** gold to buy **${quantity}** Extra Claim${quantity !== 1 ? "s" : ""}, but you only have **${balance.toLocaleString()}** gold.`,
      ephemeral: true
    });
    return;
  }

  await prisma.$transaction(async (tx) => {
    const inv = await tx.userInventory.findUnique({
      where: { userId },
      select: { gold: true }
    });
    if ((inv?.gold ?? 0) < totalPrice) {
      throw new Error("insufficient_gold");
    }
    await tx.userInventory.upsert({
      where: { userId },
      create: { userId, gold: 0 },
      update: { gold: { increment: -totalPrice } }
    });
    await tx.extraClaim.createMany({
      data: Array.from({ length: quantity }, () => ({ userId }))
    });
  });

  const remaining = await getExtraClaimCount(userId);
  await interaction.reply({
    content: `You bought **${quantity}** Extra Claim${quantity !== 1 ? "s" : ""} for **${totalPrice.toLocaleString()}** gold. You now have **${remaining}** Extra Claim${remaining !== 1 ? "s" : ""}.`
  });
}

async function handleBuyExtraCommanderDrop(interaction: ChatInputCommandInteraction, quantity: number): Promise<void> {
  const userId = interaction.user.id;
  const unitPrice = gameConfig.toolshop.extraCommanderDropPrice;
  const totalPrice = unitPrice * quantity;
  const balance = await getGold(userId);

  if (balance < totalPrice) {
    await interaction.reply({
      content: `You need **${totalPrice.toLocaleString()}** gold to buy **${quantity}** Extra CommanderDrop${quantity !== 1 ? "s" : ""}, but you only have **${balance.toLocaleString()}** gold.`,
      ephemeral: true
    });
    return;
  }

  await prisma.$transaction(async (tx) => {
    const inv = await tx.userInventory.findUnique({
      where: { userId },
      select: { gold: true }
    });
    if ((inv?.gold ?? 0) < totalPrice) {
      throw new Error("insufficient_gold");
    }
    await tx.userInventory.upsert({
      where: { userId },
      create: { userId, gold: 0 },
      update: { gold: { increment: -totalPrice } }
    });
    await tx.extraCommanderDrop.createMany({
      data: Array.from({ length: quantity }, () => ({ userId }))
    });
  });

  const remaining = await getExtraCommanderDropCount(userId);
  await interaction.reply({
    content: `You bought **${quantity}** Extra CommanderDrop${quantity !== 1 ? "s" : ""} for **${totalPrice.toLocaleString()}** gold. You now have **${remaining}** Extra CommanderDrop${remaining !== 1 ? "s" : ""}.`
  });
}

async function handleBuyExtraLandDrop(interaction: ChatInputCommandInteraction, quantity: number): Promise<void> {
  const userId = interaction.user.id;
  const unitPrice = gameConfig.toolshop.extraLandDropPrice;
  const totalPrice = unitPrice * quantity;
  const balance = await getGold(userId);

  if (balance < totalPrice) {
    await interaction.reply({
      content: `You need **${totalPrice.toLocaleString()}** gold to buy **${quantity}** Extra LandDrop${quantity !== 1 ? "s" : ""}, but you only have **${balance.toLocaleString()}** gold.`,
      ephemeral: true
    });
    return;
  }

  await prisma.$transaction(async (tx) => {
    const inv = await tx.userInventory.findUnique({
      where: { userId },
      select: { gold: true }
    });
    if ((inv?.gold ?? 0) < totalPrice) {
      throw new Error("insufficient_gold");
    }
    await tx.userInventory.upsert({
      where: { userId },
      create: { userId, gold: 0 },
      update: { gold: { increment: -totalPrice } }
    });
    await tx.extraLandDrop.createMany({
      data: Array.from({ length: quantity }, () => ({ userId }))
    });
  });

  const remaining = await getExtraLandDropCount(userId);
  await interaction.reply({
    content: `You bought **${quantity}** Extra LandDrop${quantity !== 1 ? "s" : ""} for **${totalPrice.toLocaleString()}** gold. You now have **${remaining}** Extra LandDrop${remaining !== 1 ? "s" : ""}.`
  });
}

export const buyCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("buy")
    .setDescription("Buy a card from the Black Market or a tool from the Tool Shop.")
    .addStringOption((opt) =>
      opt
        .setName("id")
        .setDescription("Card ID from the market (A–L), 'extra claim', 'extra commanderdrop', or 'extra landdrop'")
        .setRequired(true)
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const idArg = interaction.options.getString("id", true).trim();

    const extraClaimMatch = idArg.toLowerCase().match(/^extra\s+claim(?:\s+(\d+))?$/);
    if (extraClaimMatch) {
      const quantity = extraClaimMatch[1] ? parseInt(extraClaimMatch[1], 10) : 1;
      if (quantity < 1 || !Number.isFinite(quantity)) {
        await interaction.reply({ content: "Quantity must be a positive number.", ephemeral: true });
        return;
      }
      await handleBuyExtraClaim(interaction, quantity);
      return;
    }

    const extraCmdDropMatch = idArg.toLowerCase().match(/^extra\s+(?:commanderdrop|cmd)(?:\s+(\d+))?$/);
    if (extraCmdDropMatch) {
      const quantity = extraCmdDropMatch[1] ? parseInt(extraCmdDropMatch[1], 10) : 1;
      if (quantity < 1 || !Number.isFinite(quantity)) {
        await interaction.reply({ content: "Quantity must be a positive number.", ephemeral: true });
        return;
      }
      await handleBuyExtraCommanderDrop(interaction, quantity);
      return;
    }

    const extraLandDropMatch = idArg.toLowerCase().match(/^extra\s+(?:landdrop|ld)(?:\s+(\d+))?$/);
    if (extraLandDropMatch) {
      const quantity = extraLandDropMatch[1] ? parseInt(extraLandDropMatch[1], 10) : 1;
      if (quantity < 1 || !Number.isFinite(quantity)) {
        await interaction.reply({ content: "Quantity must be a positive number.", ephemeral: true });
        return;
      }
      await handleBuyExtraLandDrop(interaction, quantity);
      return;
    }

    const marketId = parseMarketId(idArg);
    if (!marketId) {
      await interaction.reply({
        content: "Invalid card ID. Use a letter from **A** to **L** as shown in `/market`.",
        ephemeral: true
      });
      return;
    }

    const guildId = interaction.guildId;
    const channelId = interaction.channelId;
    if (!guildId || !channelId) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        ephemeral: true
      });
      return;
    }

    const { slotIndex } = getMarketSlot();
    const cards = await getMarketCardsForSlot(slotIndex);
    const entry = cards.find((e) => e.id === marketId);
    if (!entry) {
      await interaction.reply({
        content: "That card is not available in the current market. Check `/market` for current listings.",
        ephemeral: true
      });
      return;
    }

    const userId = interaction.user.id;
    const balance = await getGold(userId);
    if (balance < entry.priceGold) {
      await interaction.reply({
        content: `You need **${entry.priceGold.toLocaleString()}** gold to buy **${entry.card.name}**, but you only have **${balance.toLocaleString()}** gold.`,
        ephemeral: true
      });
      return;
    }

    const botUserId = interaction.client.user?.id ?? "0";

    const displayId = await prisma.$transaction(async (tx) => {
      // Verify balance inside the transaction to prevent race conditions.
      const inv = await tx.userInventory.findUnique({
        where: { userId },
        select: { gold: true }
      });
      if ((inv?.gold ?? 0) < entry.priceGold) {
        throw new Error("insufficient_gold");
      }

      // Generate unique displayId inside the transaction.
      let id = generateDisplayId();
      for (let attempt = 0; attempt < 10; attempt++) {
        const existing = await tx.userCard.findUnique({ where: { displayId: id }, select: { id: true } });
        if (!existing) break;
        id = generateDisplayId();
      }

      const drop = await tx.drop.create({
        data: {
          guildId,
          channelId,
          dropperUserId: botUserId,
          expiresAt: new Date(0),
          resolvedAt: new Date()
        }
      });
      await tx.dropSlot.create({
        data: {
          dropId: drop.id,
          slotIndex: 0,
          cardId: entry.card.id,
          claimedByUserId: userId,
          claimedAt: new Date()
        }
      });
      const bonuses = isLegendaryCreature(entry.card.typeLine)
        ? rollClashBonuses("mint")
        : {};

      await tx.userCard.create({
        data: {
          displayId: id,
          userId,
          cardId: entry.card.id,
          dropId: drop.id,
          condition: "mint",
          ...bonuses
        }
      });

      // Deduct gold inside the same transaction.
      await tx.userInventory.upsert({
        where: { userId },
        create: { userId, gold: 0 },
        update: { gold: { increment: -entry.priceGold } }
      });

      return id;
    });

    await interaction.reply({
      content: `You bought **${entry.card.name}** for **${entry.priceGold.toLocaleString()}** gold. Card ID: \`${displayId}\``,
      ephemeral: false
    });
  }
};
