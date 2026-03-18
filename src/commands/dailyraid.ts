import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  SlashCommandBuilder
} from "discord.js";
import type { SlashCommand } from "./types.js";
import { getDailyBoss } from "../services/dailyRaidService.js";
import { getCardImageUrl } from "../utils/cardFormatting.js";
import { buildDailyRaidEmbed } from "../utils/clashFormatting.js";

export const DAILYRAID_CHALLENGE_PREFIX = "dailyraid_challenge";
export const DAILYRAID_RUN_PREFIX = "dailyraid_run";

export const dailyraidCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("dailyraid")
    .setDescription("Challenge today's daily raid boss!"),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guildId) {
      await interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
      return;
    }

    await interaction.deferReply();

    const boss = await getDailyBoss();
    const imageUrl = getCardImageUrl(boss.card);
    const embed = buildDailyRaidEmbed(boss.stats, imageUrl, boss.bonusAbility);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${DAILYRAID_CHALLENGE_PREFIX}:${interaction.user.id}`)
        .setLabel("Challenge")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`${DAILYRAID_RUN_PREFIX}:${interaction.user.id}`)
        .setLabel("Run Away")
        .setStyle(ButtonStyle.Danger)
    );

    await interaction.editReply({
      embeds: [embed],
      components: [row]
    });
  }
};
