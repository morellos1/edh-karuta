import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder
} from "discord.js";
import type { SlashCommand } from "./types.js";
import { gameConfig } from "../config.js";

export const toolshopCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("toolshop")
    .setDescription("Browse the Tool Shop for extra tools and power-ups."),
  async execute(interaction: ChatInputCommandInteraction) {
    const embed = buildToolshopEmbed();
    await interaction.reply({ embeds: [embed] });
  }
};

export function buildToolshopEmbed(): EmbedBuilder {
  const extraClaimPrice = gameConfig.toolshop.extraClaimPrice.toLocaleString();
  const extraCommanderDropPrice = gameConfig.toolshop.extraCommanderDropPrice.toLocaleString();

  return new EmbedBuilder()
    .setTitle("Browse Tool Shop")
    .setDescription(
      `**Extra Claim**\n` +
      `*Allows you to claim a card even when your claim is on cooldown.*\n` +
      `\`\`\`diff\n- ${extraClaimPrice} Gold\n> /buy extra claim\n\`\`\`\n` +
      `**Extra CommanderDrop**\n` +
      `*Allows you to use /commanderdrop even when it is on cooldown.*\n` +
      `\`\`\`diff\n- ${extraCommanderDropPrice} Gold\n> /buy extra commanderdrop\n\`\`\``
    )
    .setColor(0x2b2d31);
}
