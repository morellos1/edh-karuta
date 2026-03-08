import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { getUserCardByDisplayId } from "../repositories/userCardRepo.js";
import { getCheapestPrintPricesByNames, getDefaultBasePriceUsd } from "../repositories/cardRepo.js";
import type { SlashCommand } from "./types.js";
import {
  formatConditionLabel,
  formatConditionPrice
} from "../services/conditionService.js";

export const lookupCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("lookup")
    .setDescription("View a specific collected card instance by its unique ID.")
    .addStringOption((opt) =>
      opt.setName("id").setDescription("6-character instance ID (e.g. from collection)").setRequired(true)
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const id = interaction.options.getString("id", true).trim();
    const userCard = await getUserCardByDisplayId(id);

    if (!userCard) {
      await interaction.reply({
        content: "No collected card found with that ID.",
        ephemeral: true
      });
      return;
    }

    const baseUsd =
      userCard.card.usdPrice != null && Number.isFinite(Number(userCard.card.usdPrice))
        ? Number(userCard.card.usdPrice)
        : (await getCheapestPrintPricesByNames([userCard.card.name])).get(userCard.card.name) ??
          getDefaultBasePriceUsd();
    const displayPrice = formatConditionPrice(String(baseUsd), userCard.condition);

    const image =
      userCard.card.imagePng ??
      userCard.card.imageLarge ??
      userCard.card.imageNormal ??
      userCard.card.imageSmall;
    const claimedAt = userCard.claimedAt.toISOString().split("T")[0];

    const embed = new EmbedBuilder()
      .setTitle(userCard.card.name)
      .addFields(
        { name: "ID", value: userCard.displayId, inline: true },
        { name: "Condition", value: formatConditionLabel(userCard.condition), inline: true },
        { name: "Gold", value: displayPrice, inline: true },
        { name: "Dropped", value: claimedAt, inline: true },
        { name: "Owner", value: `<@${userCard.userId}>`, inline: true }
      );

    if (image) {
      embed.setImage(image);
    }

    await interaction.reply({ embeds: [embed], ephemeral: false });
  }
};
