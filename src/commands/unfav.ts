import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import type { SlashCommand } from "./types.js";
import { setTagFavorite } from "../repositories/tagRepo.js";

export const unfavCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("unfav")
    .setDescription("Unfavorite a tag — cards will no longer be protected from burning.")
    .addStringOption((opt) =>
      opt
        .setName("tagname")
        .setDescription("The tag to unfavorite")
        .setRequired(true)
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const userId = interaction.user.id;
    const tagName = interaction.options.getString("tagname", true).trim();

    const result = await setTagFavorite(userId, tagName, false);

    if (!result.ok) {
      const messages: Record<string, string> = {
        tag_not_found: "Tag not found. Use `/tags` to list your tags.",
        not_favorite: `Tag **${tagName}** is not favorited.`
      };
      await interaction.reply({
        content: messages[result.reason!] ?? "Could not unfavorite that tag.",
        ephemeral: true
      });
      return;
    }

    await interaction.reply({
      content: `Tag **${tagName}** is no longer favorited.`
    });
  }
};
