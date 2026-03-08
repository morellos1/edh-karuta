import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { gameConfig } from "../config.js";
import type { SlashCommand } from "./types.js";
import { getDropCooldownRemainingMs, getCommanderdropCooldownRemainingMs, getColordropCooldownRemainingMs } from "../repositories/botConfigRepo.js";
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
    .setDescription("View your current Claim and Drop cooldowns."),
  async execute(interaction: ChatInputCommandInteraction) {
    const userId = interaction.user.id;
    const claimRemainingMs = await getRemainingCooldownMs(userId, gameConfig.claimCooldownSeconds);
    const dropRemainingMs = await getDropCooldownRemainingMs(userId);
    const colordropRemainingMs = await getColordropCooldownRemainingMs(userId);
    const commanderdropRemainingMs = await getCommanderdropCooldownRemainingMs(userId);

    const claimLine = formatCooldownLine("Claim", claimRemainingMs);
    const dropLine = formatCooldownLine("Drop", dropRemainingMs);
    const colordropLine = formatCooldownLine("Color Drop", colordropRemainingMs);
    const commanderdropLine = formatCooldownLine("Commander Drop", commanderdropRemainingMs);

    const embed = new EmbedBuilder()
      .setTitle("❓ View Cooldowns")
      .setDescription(
        `Showing cooldowns for <@${userId}>\n\n${claimLine}\n${dropLine}\n${colordropLine}\n${commanderdropLine}`
      )
      .setColor(0x2f3136);

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
