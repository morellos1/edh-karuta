import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { gameConfig } from "../config.js";
import type { SlashCommand } from "./types.js";
import { getDropCooldownRemainingMs, getCommanderdropCooldownRemainingMs, getColordropCooldownRemainingMs, getLanddropCooldownRemainingMs } from "../repositories/botConfigRepo.js";
import { getRemainingCooldownMs } from "../services/cooldownService.js";
import { formatCooldownRemaining } from "../utils/cooldownFormatting.js";

function formatCooldownLine(label: string, remainingMs: number): string {
  if (remainingMs <= 0) {
    return `**${label}** is currently available.`;
  }
  return `**${label}** is available in ${formatCooldownRemaining(remainingMs)}.`;
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
    const landdropRemainingMs = await getLanddropCooldownRemainingMs(userId);

    const claimLine = formatCooldownLine("Claim", claimRemainingMs);
    const dropLine = formatCooldownLine("Drop", dropRemainingMs);
    const colordropLine = formatCooldownLine("Color Drop", colordropRemainingMs);
    const commanderdropLine = formatCooldownLine("Commander Drop", commanderdropRemainingMs);
    const landdropLine = formatCooldownLine("Land Drop", landdropRemainingMs);

    const embed = new EmbedBuilder()
      .setTitle("❓ View Cooldowns")
      .setDescription(
        `Showing cooldowns for <@${userId}>\n\n${claimLine}\n${dropLine}\n${colordropLine}\n${commanderdropLine}\n${landdropLine}`
      )
      .setColor(0x2f3136);

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
