import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder
} from "discord.js";
import type { SlashCommand } from "./types.js";
import { getTagIdForUser } from "../repositories/tagRepo.js";
import { getAllCardsByTag } from "../repositories/collectionRepo.js";
import { getGoldValue } from "../services/conditionService.js";
import { resolveBasePrice, conditionToStars } from "../utils/cardFormatting.js";

export const BULKBURN_CONFIRM_PREFIX = "bulkburn_confirm";
export const BULKBURN_CANCEL_PREFIX = "bulkburn_cancel";

const PREVIEW_COUNT = 5;

export const bulkburnCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("bulkburn")
    .setDescription("Burn all cards with a given tag in exchange for gold.")
    .addStringOption((opt) =>
      opt
        .setName("tag")
        .setDescription("Tag name — all cards with this tag will be burned")
        .setRequired(true)
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const userId = interaction.user.id;
    const tagName = interaction.options.getString("tag", true).trim();

    const tagId = await getTagIdForUser(userId, tagName);
    if (tagId == null) {
      await interaction.reply({
        content: "Tag not found. Use `/tags` to list your tags.",
        ephemeral: true
      });
      return;
    }

    await interaction.deferReply();

    const cards = await getAllCardsByTag(userId, tagId);
    if (cards.length === 0) {
      await interaction.editReply({
        content: `No cards found with tag **${tagName}**.`
      });
      return;
    }

    // Calculate gold for each card
    const cardGolds: { card: (typeof cards)[number]; gold: number; baseUsd: number }[] = [];
    for (const entry of cards) {
      const baseUsd = await resolveBasePrice(entry.card.usdPrice, entry.card.name, entry.card.eurPrice);
      const gold = getGoldValue(String(baseUsd), entry.condition);
      cardGolds.push({ card: entry, gold, baseUsd });
    }

    const totalGold = cardGolds.reduce((sum, c) => sum + c.gold, 0);

    // Build preview lines (first N cards)
    const previewLines = cardGolds.slice(0, PREVIEW_COUNT).map((c) => {
      const stars = conditionToStars(c.card.condition);
      const set = c.card.card.setCode.toUpperCase();
      return `🔥 \`${c.card.displayId}\` · \`${stars}\` · **${c.card.card.name}** (${set})`;
    });

    const description = [
      `<@${userId}>, you will receive:`,
      "",
      `💰 **${totalGold} Gold**\\*`,
      "",
      `You are burning these **${cards.length}** cards:`,
      ...previewLines
    ].join("\n");

    const footerParts = ["*Gold values are approximate"];
    if (cards.length > PREVIEW_COUNT) {
      footerParts.push(`Showing cards 1–${PREVIEW_COUNT} of ${cards.length}`);
    }

    const embed = new EmbedBuilder()
      .setTitle("Burn Cards")
      .setDescription(description)
      .setColor(0x808080)
      .setFooter({ text: footerParts.join(" · ") });

    // Encode tag name in customId so the button handler can re-query
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${BULKBURN_CANCEL_PREFIX}:${userId}:${tagName}`)
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("❌"),
      new ButtonBuilder()
        .setCustomId(`${BULKBURN_CONFIRM_PREFIX}:${userId}:${tagName}`)
        .setStyle(ButtonStyle.Danger)
        .setEmoji("🔥")
        .setLabel("Burn All")
    );

    await interaction.editReply({
      embeds: [embed],
      components: [row]
    });
  }
};
