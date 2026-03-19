import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  SlashCommandBuilder
} from "discord.js";
import type { SlashCommand } from "./types.js";
import { prisma } from "../db.js";
import { buildClashStats, isLegendaryCreature } from "../services/clashService.js";
import { getCardImageUrl } from "../utils/cardFormatting.js";
import { buildStatsEmbed } from "../utils/clashFormatting.js";
import {
  getCommanderRecord,
  getBestRecord
} from "../services/endlessTowerService.js";

export const ENDLESS_CHALLENGE_PREFIX = "endless_challenge";
export const ENDLESS_CANCEL_PREFIX = "endless_cancel";

export const endlessCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("endless")
    .setDescription("Challenge the Endless Tower with your commander!"),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guildId) {
      await interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
      return;
    }

    await interaction.deferReply();

    // Load player's set commander
    const clashCreature = await prisma.clashCreature.findUnique({
      where: {
        discordId_guildId: { discordId: interaction.user.id, guildId: interaction.guildId }
      },
      include: {
        userCard: { include: { card: true } }
      }
    });

    if (!clashCreature) {
      await interaction.editReply({
        content: "You haven't set a commander! Use `/setcommander <id>` first."
      });
      return;
    }

    if (!isLegendaryCreature(clashCreature.userCard.card.typeLine, { isMeldResult: clashCreature.userCard.card.isMeldResult })) {
      await interaction.editReply({
        content: "Your set commander is no longer valid. Use `/setcommander <id>` to set a new one."
      });
      return;
    }

    const stats = buildClashStats(clashCreature.userCard.card, clashCreature.userCard.condition, clashCreature.userCard);
    const imageUrl = getCardImageUrl(clashCreature.userCard.card);

    // Get records
    const commanderBest = await getCommanderRecord(
      interaction.user.id,
      interaction.guildId,
      clashCreature.userCard.id
    );
    const userBest = await getBestRecord(interaction.user.id, interaction.guildId);

    // Build record string
    let record = `${clashCreature.clashWins}W ${clashCreature.clashLosses}L`;
    if (commanderBest > 0) {
      record += ` | Endless Tower: Floor ${commanderBest}`;
    }
    if (userBest > 0 && userBest !== commanderBest) {
      record += ` | Best: Floor ${userBest}`;
    }

    const embed = buildStatsEmbed(stats, imageUrl, clashCreature.userCard.condition, record);
    embed.setTitle(`${stats.name} - Endless Tower`);
    embed.setDescription(
      "Challenge the **Endless Tower** and fight through increasingly difficult bosses!\n\n" +
      "Each floor has a random boss that gets stronger. " +
      "How far can you go?"
    );

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${ENDLESS_CHALLENGE_PREFIX}:${interaction.user.id}`)
        .setLabel("Challenge Endless Tower")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`${ENDLESS_CANCEL_PREFIX}:${interaction.user.id}`)
        .setLabel("Cancel")
        .setStyle(ButtonStyle.Danger)
    );

    await interaction.editReply({
      embeds: [embed],
      components: [row]
    });
  }
};
