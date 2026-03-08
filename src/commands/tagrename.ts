import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import type { SlashCommand } from "./types.js";
import { renameTag } from "../repositories/tagRepo.js";

export const tagrenameCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("tagrename")
    .setDescription("Rename a tag.")
    .addStringOption((opt) =>
      opt.setName("oldtagname").setDescription("Current tag name").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("newtagname").setDescription("New tag name").setRequired(true)
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const oldName = interaction.options.getString("oldtagname", true).trim();
    const newName = interaction.options.getString("newtagname", true).trim();
    if (!newName) {
      await interaction.reply({ content: "New tag name cannot be empty.", ephemeral: true });
      return;
    }
    const tag = await renameTag(interaction.user.id, oldName, newName);
    if (!tag) {
      await interaction.reply({
        content: `Could not rename. You don't have a tag **${oldName}**, or you already have a tag **${newName}**.`,
        ephemeral: true
      });
      return;
    }
    await interaction.reply({
      content: `Renamed tag **${oldName}** to **${tag.name}**.`,
      ephemeral: false
    });
  }
};
