import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import type { SlashCommand } from "./types.js";
import { deleteTag } from "../repositories/tagRepo.js";

export const tagdeleteCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("tagdelete")
    .setDescription("Delete a tag and remove it from all cards.")
    .addStringOption((opt) =>
      opt.setName("tagname").setDescription("Name of the tag to delete").setRequired(true)
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const tagname = interaction.options.getString("tagname", true).trim();
    const deleted = await deleteTag(interaction.user.id, tagname);
    if (!deleted) {
      await interaction.reply({
        content: `You don't have a tag named **${tagname}**.`,
        ephemeral: true
      });
      return;
    }
    await interaction.reply({
      content: `Deleted tag **${tagname}**.`,
      ephemeral: false
    });
  }
};
