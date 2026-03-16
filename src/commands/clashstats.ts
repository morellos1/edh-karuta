import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import type { SlashCommand } from "./types.js";
import { prisma } from "../db.js";
import { getUserCardByDisplayId } from "../repositories/userCardRepo.js";
import { buildClashStats, isLegendaryCreature } from "../services/clashService.js";
import { getCardImageUrl } from "../utils/cardFormatting.js";
import { buildStatsEmbed } from "../utils/clashFormatting.js";

export const creaturestatsCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("creaturestats")
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

    if (!isLegendaryCreature(userCard.card.typeLine, { isMeldResult: userCard.card.isMeldResult })) {
      await interaction.reply({
        content: "Only legendary creatures have Clash stats.",
        ephemeral: true
      });
      return;
    }

    const stats = buildClashStats(userCard.card, userCard.condition);
    const imageUrl = getCardImageUrl(userCard.card);

    // Look up W/L record if this card is set as a clash creature
    let record: string | null = null;
    const clashCreature = await prisma.clashCreature.findFirst({
      where: { userCardId: userCard.id }
    });
    if (clashCreature) {
      record = `${clashCreature.clashWins}W ${clashCreature.clashLosses}L`;
    }

    const embed = buildStatsEmbed(stats, imageUrl, userCard.condition, record);

    await interaction.reply({ embeds: [embed] });
  }
};
