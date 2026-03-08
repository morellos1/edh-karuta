import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder
} from "discord.js";
import type { SlashCommand } from "./types.js";
import { getUserCardByDisplayId } from "../repositories/userCardRepo.js";
import { getGoldValue } from "../services/conditionService.js";
import { GIVE_ACCEPT_PREFIX, GIVE_DECLINE_PREFIX } from "../interactions/tradeGiveButton.js";
import { conditionToStars, getCardImageUrl, resolveBasePrice } from "../utils/cardFormatting.js";

export const giveCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("give")
    .setDescription("Send one of your cards to another user (they can accept or decline).")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("Who you want to give the card to").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("cardid").setDescription("Your card ID (from /collection)").setRequired(true)
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const target = interaction.options.getUser("user", true);
    const cardId = interaction.options.getString("cardid", true).trim();

    if (target.bot) {
      await interaction.reply({ content: "You cannot give cards to bots.", ephemeral: true });
      return;
    }
    if (target.id === interaction.user.id) {
      await interaction.reply({ content: "You cannot give a card to yourself.", ephemeral: true });
      return;
    }

    const myCard = await getUserCardByDisplayId(cardId);
    if (!myCard || myCard.userId !== interaction.user.id) {
      await interaction.reply({
        content: "Invalid card ID, or that card is not in your collection.",
        ephemeral: true
      });
      return;
    }

    const image = getCardImageUrl(myCard.card);

    const baseUsd = await resolveBasePrice(myCard.card.usdPrice, myCard.card.name);
    const gold = getGoldValue(String(baseUsd), myCard.condition);
    const stars = conditionToStars(myCard.condition);
    const embed = new EmbedBuilder()
      .setTitle("Card Transfer")
      .setDescription(`<@${interaction.user.id}> → <@${target.id}>`)
      .addFields({
        name: "\u200b",
        value: `\`${myCard.displayId}\` · \`${stars}\` · \`💰 ${gold} Gold\` · **${myCard.card.name}**`,
        inline: false
      })
      .setColor(0x808080);

    if (image) {
      embed.setImage(image);
    }

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${GIVE_DECLINE_PREFIX}:${interaction.user.id}:${target.id}:${myCard.displayId}`)
        .setEmoji("❌")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${GIVE_ACCEPT_PREFIX}:${interaction.user.id}:${target.id}:${myCard.displayId}`)
        .setEmoji("✅")
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({
      embeds: [embed],
      components: [row],
      ephemeral: false
    });
  }
};
