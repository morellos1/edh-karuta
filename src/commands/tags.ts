import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import type { SlashCommand } from "./types.js";
import { getTagsByUserId } from "../repositories/tagRepo.js";

export const tagsCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("tags")
    .setDescription("List your tags or another user's tags.")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("User whose tags to list (omit for yourself)").setRequired(false)
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const target = interaction.options.getUser("user", false) ?? interaction.user;
    const { tags, total } = await getTagsByUserId(target.id, 1, 500);

    const description =
      tags.length > 0
        ? tags
            .map((t) => `${t.isFavorite ? "❤️ " : ""}**${t.name}** — ${t.cardCount} card${t.cardCount !== 1 ? "s" : ""}`)
            .join("\n")
        : "No tags yet. Create one with `/tagcreate`.";

    const footer = total > 0 ? `Showing tags 1-${total} of ${total}` : "No tags yet.";

    const embed = new EmbedBuilder()
      .setTitle("Tags")
      .setDescription(`Tags created by <@${target.id}>\n\n${description}`)
      .setFooter({ text: footer })
      .setColor(0x2b2d31);

    await interaction.reply({
      embeds: [embed],
      ephemeral: false
    });
  }
};
