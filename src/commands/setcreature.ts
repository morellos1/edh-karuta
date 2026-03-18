import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import type { SlashCommand } from "./types.js";
import { getUserCardByDisplayId } from "../repositories/userCardRepo.js";
import { prisma } from "../db.js";
import { buildClashStats, isLegendaryCreature } from "../services/clashService.js";
import { getCardImageUrl } from "../utils/cardFormatting.js";
import { buildStatsEmbed } from "../utils/clashFormatting.js";

export const setcommanderCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("setcommander")
    .setDescription("Set your active commander for Clash battles.")
    .addStringOption((opt) =>
      opt.setName("id").setDescription("6-character card instance ID from your collection").setRequired(true)
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guildId) {
      await interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
      return;
    }

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
        content: "Only legendary creatures are eligible for Clash battles.",
        ephemeral: true
      });
      return;
    }

    // Upsert the clash creature selection
    await prisma.clashCreature.upsert({
      where: {
        discordId_guildId: {
          discordId: interaction.user.id,
          guildId: interaction.guildId
        }
      },
      create: {
        discordId: interaction.user.id,
        guildId: interaction.guildId,
        userCardId: userCard.id
      },
      update: {
        userCardId: userCard.id,
        clashWins: 0,
        clashLosses: 0
      }
    });

    const stats = buildClashStats(userCard.card, userCard.condition, userCard);
    const imageUrl = getCardImageUrl(userCard.card);
    const embed = buildStatsEmbed(stats, imageUrl, userCard.condition);

    await interaction.reply({
      content: `Your clash creature has been set to **${stats.name}**!`,
      embeds: [embed]
    });
  }
};
