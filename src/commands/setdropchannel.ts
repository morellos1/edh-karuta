import { ChatInputCommandInteraction, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { SlashCommand } from "./types.js";
import { setDropChannelId } from "../repositories/botConfigRepo.js";

export const setdropchannelCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("setdropchannel")
    .setDescription("Set this channel as the bot's 30-minute drop channel. Only one channel can be set.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guildId || !interaction.channelId) {
      await interaction.reply({
        content: "This command can only be used in a server channel.",
        ephemeral: true
      });
      return;
    }
    await setDropChannelId(interaction.guildId, interaction.channelId);
    await interaction.reply({
      content: "This channel is now the bot drop channel. I'll drop 3 cards here every 30 minutes.",
      ephemeral: false
    });
  }
};
