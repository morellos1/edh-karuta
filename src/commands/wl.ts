import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import type { SlashCommand } from "./types.js";
import { gameConfig } from "../config.js";
import { getUserWishlist } from "../repositories/wishlistRepo.js";
import { getTypeLinesByNames } from "../repositories/cardRepo.js";

export const wlCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("wl")
    .setDescription("View a user's wishlist.")
    .addUserOption((opt) =>
      opt
        .setName("user")
        .setDescription("The user whose wishlist to view (defaults to you)")
        .setRequired(false)
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guildId) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        ephemeral: true
      });
      return;
    }

    const targetUser = interaction.options.getUser("user") ?? interaction.user;
    const entries = await getUserWishlist(targetUser.id, interaction.guildId);
    const available = gameConfig.maxWishlistSlots - entries.length;

    const embed = new EmbedBuilder()
      .setAuthor({ name: "Wishlist" })
      .setDescription(
        `Showing wishlist of <@${targetUser.id}>\nAvailable slots: ${available}/${gameConfig.maxWishlistSlots}`
      );

    if (!entries.length) {
      embed.setFooter({ text: "Showing cards 0–0 of 0" });
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    const typeLines = await getTypeLinesByNames(entries.map((e) => e.cardName));

    const lines = entries.map((entry) => {
      const typeLine = typeLines.get(entry.cardName) ?? "Card";
      return `\u2022 ${typeLine} \u00b7 **${entry.cardName}**`;
    });

    embed.setDescription(
      embed.data.description + "\n\n" + lines.join("\n")
    );
    embed.setFooter({
      text: `Showing cards 1\u2013${entries.length} of ${entries.length}`
    });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
