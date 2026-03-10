import { ChatInputCommandInteraction, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { SlashCommand } from "./types.js";
import { setShortcutsEnabled, getGuildSettings } from "../repositories/guildSettingsRepo.js";

export const shortcutCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("shortcut")
    .setDescription("Enable or disable text shortcuts (e.g. kd, kc, kb) alongside slash commands.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((opt) =>
      opt
        .setName("toggle")
        .setDescription("Enable or disable shortcuts")
        .setRequired(true)
        .addChoices(
          { name: "Enable", value: "enable" },
          { name: "Disable", value: "disable" }
        )
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guildId) {
      await interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
      return;
    }

    const toggle = interaction.options.getString("toggle", true);
    const enabled = toggle === "enable";
    await setShortcutsEnabled(interaction.guildId, enabled);
    const settings = await getGuildSettings(interaction.guildId);

    await interaction.reply({
      content: enabled
        ? `Text shortcuts **enabled**. Use prefix **${settings.prefix}** (e.g. \`${settings.prefix}d\` for drop). Change prefix with \`/setprefix\`.`
        : "Text shortcuts **disabled**. Only slash commands will work.",
      ephemeral: false
    });
  }
};
