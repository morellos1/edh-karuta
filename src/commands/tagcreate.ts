import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import type { SlashCommand } from "./types.js";
import { createTag } from "../repositories/tagRepo.js";

export const tagcreateCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("tagcreate")
    .setDescription("Create a new tag for your collection.")
    .addStringOption((opt) =>
      opt.setName("tagname").setDescription("Name of the tag").setRequired(true)
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const tagname = interaction.options.getString("tagname", true).trim();
    if (!tagname) {
      await interaction.reply({ content: "Tag name cannot be empty.", ephemeral: true });
      return;
    }
    const tag = await createTag(interaction.user.id, tagname);
    if (!tag) {
      await interaction.reply({
        content: `You already have a tag named **${tagname}**.`,
        ephemeral: true
      });
      return;
    }
    await interaction.reply({
      content: `Created tag **${tag.name}**.`,
      ephemeral: false
    });
  }
};
