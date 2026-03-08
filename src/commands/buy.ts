import {
  ChatInputCommandInteraction,
  SlashCommandBuilder
} from "discord.js";
import type { SlashCommand } from "./types.js";
import { prisma } from "../db.js";
import { getMarketSlot, getMarketCardsForSlot, MARKET_IDS, type MarketCardId } from "../services/marketService.js";
import { getGold, addGold } from "../repositories/inventoryRepo.js";
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
        .setDescription("Card ID from the market (A–F)")
        .setRequired(true)
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const idArg = interaction.options.getString("id", true).trim();
    const marketId = parseMarketId(idArg);
    if (!marketId) {
      await interaction.reply({
        content: "Invalid card ID. Use a letter from **A** to **F** as shown in `/market`.",
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
        content: `You need **${entry.priceGold}** gold to buy **${entry.card.name}**, but you only have **${balance}** gold.`,
        ephemeral: true
      });
      return;
    }

    const botUserId = interaction.client.user?.id ?? "0";
    let displayId = generateDisplayId();
    for (let attempt = 0; attempt < 10; attempt++) {
      const existing = await prisma.userCard.findUnique({ where: { displayId }, select: { id: true } });
      if (!existing) break;
      displayId = generateDisplayId();
    }

    await prisma.$transaction(async (tx) => {
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
          displayId,
          userId,
          cardId: entry.card.id,
          dropId: drop.id,
          condition: "mint"
        }
      });
    });

    await addGold(userId, -entry.priceGold);

    await interaction.reply({
      content: `You bought **${entry.card.name}** for **${entry.priceGold}** gold. Card ID: \`${displayId}\``,
      ephemeral: false
    });
  }
};
