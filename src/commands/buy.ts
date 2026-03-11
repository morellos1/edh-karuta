import {
  ChatInputCommandInteraction,
  SlashCommandBuilder
} from "discord.js";
import type { SlashCommand } from "./types.js";
import { prisma } from "../db.js";
import { getMarketSlot, getMarketCardsForSlot, MARKET_IDS, type MarketCardId } from "../services/marketService.js";
import { getGold } from "../repositories/inventoryRepo.js";
import { generateDisplayId } from "../utils/displayId.js";

function parseMarketId(input: string): MarketCardId | null {
  const upper = input.trim().toUpperCase();
  return MARKET_IDS.includes(upper as MarketCardId) ? (upper as MarketCardId) : null;
}

export const buyCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("buy")
    .setDescription("Buy a card from the Black Market with gold.")
    .addStringOption((opt) =>
      opt
        .setName("id")
        .setDescription("Card ID from the market (A–L)")
        .setRequired(true)
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const idArg = interaction.options.getString("id", true).trim();
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
      await tx.userCard.create({
        data: {
          displayId: id,
          userId,
          cardId: entry.card.id,
          dropId: drop.id,
          condition: "mint"
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
