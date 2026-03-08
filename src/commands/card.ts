import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { findCardByQuery, findCardPrintsByName } from "../repositories/cardRepo.js";
import { getCardCirculationCount } from "../repositories/userCardRepo.js";
import { getWishlistCardCount } from "../repositories/wishlistRepo.js";
import type { SlashCommand } from "./types.js";
import { formatColorCircles, formatBaseGold, formatRarity } from "../utils/cardFormatting.js";
import { buildCardPrintComponents } from "../interactions/cardPrintButton.js";

export const cardCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("card")
    .setDescription("View full details for a card (first print). Use arrows to cycle prints.")
    .addStringOption((opt) =>
      opt
        .setName("query")
        .setDescription("Card name, or: setCode collectorNumber")
        .setRequired(true)
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const query = interaction.options.getString("query", true);
    const card = await findCardByQuery(query);

    if (!card) {
      await interaction.reply({ content: "No card found for that query.", ephemeral: true });
      return;
    }

    const prints =
      query.trim().match(/^[a-z0-9]{2,6}\s+[a-z0-9]+$/i) != null
        ? [card]
        : await findCardPrintsByName(card.name);
    const showCard = prints[0] ?? card;
    const [circulation, wishlisted] = await Promise.all([
      getCardCirculationCount(showCard.id),
      getWishlistCardCount(showCard.name)
    ]);
    const image = showCard.imagePng ?? showCard.imageLarge ?? showCard.imageNormal ?? showCard.imageSmall;
    const cardCode = `${showCard.setCode.toUpperCase()}${showCard.collectorNumber.toUpperCase()}`;
    const scryfallUrl = `https://scryfall.com/card/${showCard.setCode}/${showCard.collectorNumber}?utm_source=edh_karuta`;
    const embed = new EmbedBuilder()
      .setTitle(`${showCard.name} (${cardCode})`)
      .setURL(scryfallUrl)
      .setDescription(
        [showCard.manaCost ?? "", showCard.typeLine ?? "", showCard.oracleText ?? ""]
          .filter(Boolean)
          .join("\n")
      )
      .addFields(
        { name: "Rarity", value: formatRarity(showCard.rarity), inline: true },
        { name: "Gold", value: formatBaseGold(showCard.usdPrice), inline: true },
        { name: "Colors", value: formatColorCircles(showCard.colorIdentity), inline: true },
        { name: "In circulation", value: `${circulation}`, inline: true },
        { name: "Wishlisted by", value: `${wishlisted}`, inline: true },
        {
          name: "Print",
          value: prints.length > 1 ? `1 / ${prints.length}` : "1 / 1",
          inline: true
        },
        { name: "Scryfall", value: `[View on Scryfall](${scryfallUrl})`, inline: false }
      );

    if (image) {
      embed.setImage(image);
    }

    const components = buildCardPrintComponents(showCard.id, 0, prints.length);
    await interaction.reply({ embeds: [embed], components, ephemeral: false });
  }
};
