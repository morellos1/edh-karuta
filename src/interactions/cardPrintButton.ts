import type { CardLookup } from "../repositories/cardRepo.js";
import { findCardPrintsByName } from "../repositories/cardRepo.js";
import { getCardCirculationCount } from "../repositories/userCardRepo.js";
import { prisma } from "../db.js";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  EmbedBuilder
} from "discord.js";
import { formatColorCircles, formatBaseGold, formatRarity } from "../utils/cardFormatting.js";

export const CARD_PRINT_PREFIX = "card_print";

async function buildCardEmbedAsync(card: CardLookup, printIndex: number, totalPrints: number) {
  const circulation = await getCardCirculationCount(card.id);
  const image = card.imagePng ?? card.imageLarge ?? card.imageNormal ?? card.imageSmall;
  const cardCode = `${card.setCode.toUpperCase()}${card.collectorNumber.toUpperCase()}`;
  const scryfallUrl = `https://scryfall.com/card/${card.setCode}/${card.collectorNumber}?utm_source=edh_karuta`;
  const embed = new EmbedBuilder()
    .setTitle(`${card.name} (${cardCode})`)
    .setURL(scryfallUrl)
    .setDescription(
      [card.manaCost ?? "", card.typeLine ?? "", card.oracleText ?? ""]
        .filter(Boolean)
        .join("\n")
    )
    .addFields(
      { name: "Rarity", value: formatRarity(card.rarity), inline: true },
      { name: "Gold", value: formatBaseGold(card.usdPrice), inline: true },
      { name: "Colors", value: formatColorCircles(card.colorIdentity), inline: true },
      { name: "In circulation", value: `${circulation}`, inline: true },
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
      .setDisabled(printIndex >= totalPrints - 1)
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
