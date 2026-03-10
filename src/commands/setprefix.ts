import { ChatInputCommandInteraction, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { SlashCommand } from "./types.js";
import { setPrefix, getGuildSettings } from "../repositories/guildSettingsRepo.js";

export const setprefixCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("setprefix")
    .setDescription("Set the single-character prefix for text shortcuts (e.g. k for kd, kc, kb).")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((opt) =>
      opt
        .setName("prefix")
        .setDescription("A single character to use as the shortcut prefix")
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(1)
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guildId) {
      await interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
      return;
    }

    const prefix = interaction.options.getString("prefix", true);
    if (prefix.length !== 1) {
      await interaction.reply({ content: "Prefix must be exactly 1 character.", ephemeral: true });
      return;
    }

    await setPrefix(interaction.guildId, prefix);
    const settings = await getGuildSettings(interaction.guildId);
    const status = settings.shortcutsEnabled ? "enabled" : "disabled";
    await interaction.reply({
      content: `Shortcut prefix set to **${prefix}**. Shortcuts are currently **${status}**. Use \`/shortcut\` to toggle.`,
      ephemeral: false
    });
  }
};
