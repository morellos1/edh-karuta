import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import type { SlashCommand } from "./types.js";
import { prisma } from "../db.js";
import { getUserCardByDisplayId } from "../repositories/userCardRepo.js";
import { buildClashStats, isLegendaryCreature } from "../services/clashService.js";
import { getCardImageUrl } from "../utils/cardFormatting.js";
import { buildStatsEmbed } from "../utils/clashFormatting.js";
import { getCommanderRecord } from "../services/endlessTowerService.js";

export const statsCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("stats")
    .setDescription("View a commander's Clash battle stats.")
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

    if (!isLegendaryCreature(userCard.card.typeLine, { isMeldResult: userCard.card.isMeldResult })) {
      await interaction.reply({
        content: "Only legendary commanders have Clash stats.",
        ephemeral: true
      });
      return;
    }

    const stats = buildClashStats(userCard.card, userCard.condition, userCard);
    const imageUrl = getCardImageUrl(userCard.card);

    // Look up W/L record if this card is set as a clash creature
    let record: string | null = null;
    const clashCreature = await prisma.clashCreature.findFirst({
      where: { userCardId: userCard.id }
    });
    if (clashCreature) {
      record = `${clashCreature.clashWins}W ${clashCreature.clashLosses}L`;

      // Add endless tower record if exists
      if (interaction.guildId) {
        const towerBest = await getCommanderRecord(
          interaction.user.id,
          interaction.guildId,
          userCard.id
        );
        if (towerBest > 0) {
          record += ` | Endless Tower: Floor ${towerBest}`;
        }
      }
    }

    const embed = buildStatsEmbed(stats, imageUrl, userCard.condition, record);

    await interaction.reply({ embeds: [embed] });
  }
};
