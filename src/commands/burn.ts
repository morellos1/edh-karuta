import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder
} from "discord.js";
import type { SlashCommand } from "./types.js";
import { getLastCollectedCard, getUserCardByDisplayId } from "../repositories/userCardRepo.js";
import { getGoldValue } from "../services/conditionService.js";
import { getCardImageUrl, resolveBasePrice } from "../utils/cardFormatting.js";

export const BURN_CONFIRM_PREFIX = "burn_confirm";
export const BURN_CANCEL_PREFIX = "burn_cancel";

export const burnCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("burn")
    .setDescription("Burn a card in exchange for gold.")
    .addStringOption((opt) =>
      opt
        .setName("id")
        .setDescription("6-character card ID from collection (omit to burn last collected)")
        .setRequired(false)
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const userId = interaction.user.id;
    const idArg = interaction.options.getString("id", false)?.trim();
    const userCard = idArg
      ? await getUserCardByDisplayId(idArg)
      : await getLastCollectedCard(userId);

    if (!userCard) {
      await interaction.reply({
        content: idArg ? "No card in your collection with that ID." : "You have no cards to burn.",
        ephemeral: true
      });
      return;
    }

    if (userCard.userId !== userId) {
      await interaction.reply({
        content: "That card is not in your collection.",
        ephemeral: true
      });
      return;
    }

    const baseUsd = await resolveBasePrice(userCard.card.usdPrice, userCard.card.name);
    const gold = getGoldValue(String(baseUsd), userCard.condition);

    const image = getCardImageUrl(userCard.card);

    const embed = new EmbedBuilder()
      .setTitle("Burn Card")
      .setDescription(`<@${userId}>, you will receive:`)
      .addFields({
        name: "\u200b",
        value: `💰 **${gold} Gold**`,
        inline: false
      })
      .setColor(0x808080);

    if (image) {
      embed.setImage(image);
    }

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${BURN_CANCEL_PREFIX}:${userCard.id}`)
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("❌"),
      new ButtonBuilder()
        .setCustomId(`${BURN_CONFIRM_PREFIX}:${userCard.id}`)
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("🔥")
    );

    await interaction.reply({
      embeds: [embed],
      components: [row],
      ephemeral: false
    });
  }
};
