import type { CardLookup } from "../repositories/cardRepo.js";
import { findCardPrintsByName } from "../repositories/cardRepo.js";
import { getCardCirculationCount } from "../repositories/userCardRepo.js";
import {
  getWishlistCardCount,
  addWishlistEntry,
  getUserWishlistCount,
  wishlistEntryExists
} from "../repositories/wishlistRepo.js";
import { gameConfig } from "../config.js";
import { prisma } from "../db.js";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  EmbedBuilder
} from "discord.js";
import { formatColorCircles, formatBaseGold, formatRarity, getCardImageUrl } from "../utils/cardFormatting.js";

export const CARD_PRINT_PREFIX = "card_print";
export const CARD_WISHADD_PREFIX = "card_wishadd";

async function buildCardEmbedAsync(card: CardLookup, printIndex: number, totalPrints: number) {
  const [circulation, wishlisted] = await Promise.all([
    getCardCirculationCount(card.id),
    getWishlistCardCount(card.name)
  ]);
  const image = getCardImageUrl(card);
  const cardCode = `${card.setCode.toUpperCase()} #${card.collectorNumber.toUpperCase()}`;
  const setLabel = card.setName ? `${card.setName} ${cardCode}` : cardCode;
  const scryfallUrl = `https://scryfall.com/card/${card.setCode}/${card.collectorNumber}?utm_source=edh_karuta`;
  const embed = new EmbedBuilder()
    .setTitle(`${card.name} (${setLabel})`)
    .setURL(scryfallUrl)
    .setDescription(
      [card.manaCost ?? "", card.typeLine ?? "", card.oracleText ?? ""]
        .filter(Boolean)
        .join("\n")
    )
    .addFields(
      { name: "Rarity", value: formatRarity(card.rarity), inline: true },
      { name: "Gold", value: formatBaseGold(card.usdPrice), inline: true },
      { name: "Colors", value: formatColorCircles(card.colors), inline: true },
      { name: "In circulation", value: `${circulation}`, inline: true },
      { name: "Wishlisted by", value: `${wishlisted}`, inline: true },
      {
        name: "Print",
        value: totalPrints > 1 ? `${printIndex + 1} / ${totalPrints}` : "1 / 1",
        inline: true
      },
      { name: "Scryfall", value: `[View on Scryfall](${scryfallUrl})`, inline: false }
    );
  if (image) embed.setImage(image);
  return embed;
}

export function buildCardPrintComponents(firstCardId: number, printIndex: number, totalPrints: number) {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${CARD_PRINT_PREFIX}:${firstCardId}:${printIndex - 1}`)
      .setLabel("⬅")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(printIndex <= 0),
    new ButtonBuilder()
      .setCustomId(`${CARD_PRINT_PREFIX}:${firstCardId}:${printIndex + 1}`)
      .setLabel("➡")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(printIndex >= totalPrints - 1),
    new ButtonBuilder()
      .setCustomId(`${CARD_WISHADD_PREFIX}:${firstCardId}`)
      .setLabel("Add to Wishlist")
      .setStyle(ButtonStyle.Success)
  );
  return [row];
}

export async function handleCardPrintButton(interaction: ButtonInteraction) {
  const parts = interaction.customId.split(":");
  if (parts[0] !== CARD_PRINT_PREFIX || parts.length < 3) return;
  const firstCardId = Number(parts[1]);
  const printIndex = Number(parts[2]);
  if (!Number.isInteger(firstCardId) || !Number.isInteger(printIndex) || printIndex < 0) {
    await interaction.reply({ content: "Invalid card print payload.", ephemeral: true });
    return;
  }

  const firstCard = await prisma.card.findUnique({
    where: { id: firstCardId },
    select: { name: true }
  });
  if (!firstCard) {
    await interaction.reply({ content: "Card data no longer available.", ephemeral: true });
    return;
  }

  const prints = await findCardPrintsByName(firstCard.name);
  if (!prints.length || printIndex >= prints.length) {
    await interaction.reply({ content: "Print not found.", ephemeral: true });
    return;
  }

  const card = prints[printIndex];
  const embed = await buildCardEmbedAsync(card, printIndex, prints.length);
  const components = buildCardPrintComponents(firstCardId, printIndex, prints.length);

  await interaction.update({ embeds: [embed], components });
}

export async function handleCardWishaddButton(interaction: ButtonInteraction) {
  const parts = interaction.customId.split(":");
  if (parts[0] !== CARD_WISHADD_PREFIX || parts.length < 2) return;

  const firstCardId = Number(parts[1]);
  if (!Number.isInteger(firstCardId)) {
    await interaction.reply({ content: "Invalid card data.", ephemeral: true });
    return;
  }

  if (!interaction.guildId) {
    await interaction.reply({ content: "This can only be used in a server.", ephemeral: true });
    return;
  }

  const card = await prisma.card.findUnique({
    where: { id: firstCardId },
    select: { name: true }
  });
  if (!card) {
    await interaction.reply({ content: "Card data no longer available.", ephemeral: true });
    return;
  }

  const cardName = card.name;

  const exists = await wishlistEntryExists(interaction.user.id, interaction.guildId, cardName);
  if (exists) {
    await interaction.reply({
      content: `**${cardName}** is already on your wishlist.`,
      ephemeral: true
    });
    return;
  }

  const count = await getUserWishlistCount(interaction.user.id, interaction.guildId);
  if (count >= gameConfig.maxWishlistSlots) {
    await interaction.reply({
      content: `Your wishlist is full (${gameConfig.maxWishlistSlots}/${gameConfig.maxWishlistSlots}). Remove a card with \`/wishremove\` first.`,
      ephemeral: true
    });
    return;
  }

  await addWishlistEntry(interaction.user.id, interaction.guildId, cardName);
  await interaction.reply({
    content: `Added **${cardName}** to your wishlist (${count + 1}/${gameConfig.maxWishlistSlots}).`,
    ephemeral: true
  });
}
