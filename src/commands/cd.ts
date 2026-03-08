import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { gameConfig } from "../config.js";
import type { SlashCommand } from "./types.js";
import { getDropCooldownRemainingMs } from "../repositories/botConfigRepo.js";
import { getRemainingCooldownMs } from "../services/cooldownService.js";

function formatCooldownLine(label: string, remainingMs: number): string {
  if (remainingMs <= 0) {
    return `**${label}** is currently available.`;
  }
  const minutes = Math.ceil(remainingMs / 60_000);
  return `**${label}** is available in **${minutes}** minute${minutes !== 1 ? "s" : ""}.`;
}

export const cdCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("cd")
    .setDescription("View your current Grab and Drop cooldowns."),
  async execute(interaction: ChatInputCommandInteraction) {
    const userId = interaction.user.id;
    const grabRemainingMs = await getRemainingCooldownMs(userId, gameConfig.claimCooldownSeconds);
    const dropRemainingMs = await getDropCooldownRemainingMs(userId);

    const grabLine = formatCooldownLine("Grab", grabRemainingMs);
    const dropLine = formatCooldownLine("Drop", dropRemainingMs);

    const embed = new EmbedBuilder()
      .setTitle("❓ View Cooldowns")
      .setDescription(
        `Showing cooldowns for <@${userId}>\n\n${grabLine}\n${dropLine}`
      )
      .setColor(0x2f3136);

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
