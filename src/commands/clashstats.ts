import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import type { SlashCommand } from "./types.js";
import { getUserCardByDisplayId } from "../repositories/userCardRepo.js";
import { buildClashStats, isLegendaryCreature } from "../services/clashService.js";
import { getCardImageUrl } from "../utils/cardFormatting.js";
import { buildStatsEmbed } from "../utils/clashFormatting.js";

export const clashstatsCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("clashstats")
    .setDescription("View a creature's Clash battle stats.")
    .addStringOption((opt) =>
      opt.setName("id").setDescription("6-character card instance ID from your collection").setRequired(true)
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const displayId = interaction.options.getString("id", true).trim();
    const userCard = await getUserCardByDisplayId(displayId);

    if (!userCard) {
      await interaction.reply({ content: "No card found with that ID.", ephemeral: true });
      return;
    }

    if (userCard.userId !== interaction.user.id) {
      await interaction.reply({ content: "You don't own that card.", ephemeral: true });
      return;
    }

    if (!isLegendaryCreature(userCard.card.typeLine)) {
      await interaction.reply({
        content: "Only legendary creatures have Clash stats.",
        ephemeral: true
      });
      return;
    }

    const stats = buildClashStats(userCard.card, userCard.condition);
    const imageUrl = getCardImageUrl(userCard.card);
    const embed = buildStatsEmbed(stats, imageUrl, userCard.condition);

    await interaction.reply({ embeds: [embed] });
  }
};
