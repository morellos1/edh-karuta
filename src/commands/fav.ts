import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import type { SlashCommand } from "./types.js";
import { setTagFavorite } from "../repositories/tagRepo.js";

export const favCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("fav")
    .setDescription("Favorite a tag — cards in favorited tags are protected from burning.")
    .addStringOption((opt) =>
      opt
        .setName("tagname")
        .setDescription("The tag to favorite")
        .setRequired(true)
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const userId = interaction.user.id;
    const tagName = interaction.options.getString("tagname", true).trim();

    const result = await setTagFavorite(userId, tagName, true);

    if (!result.ok) {
      const messages: Record<string, string> = {
        tag_not_found: "Tag not found. Use `/tags` to list your tags.",
        already_favorite: `Tag **${tagName}** is already favorited.`,
        limit_reached: "You can only favorite up to **5** tags. Unfavorite one first with `/unfav`."
      };
      await interaction.reply({
        content: messages[result.reason!] ?? "Could not favorite that tag.",
        ephemeral: true
      });
      return;
    }

    await interaction.reply({
      content: `Tag **${tagName}** is now favorited. Cards in this tag are protected from burning.`
    });
  }
};
