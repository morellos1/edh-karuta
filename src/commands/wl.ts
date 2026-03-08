import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import type { SlashCommand } from "./types.js";
import { gameConfig } from "../config.js";
import { getUserWishlist } from "../repositories/wishlistRepo.js";

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

    const isSelf = targetUser.id === interaction.user.id;
    const displayName = isSelf ? "Your" : `${targetUser.displayName}'s`;

    if (!entries.length) {
      await interaction.reply({
        content: `${displayName} wishlist is empty.`,
        ephemeral: true
      });
      return;
    }

    const lines = entries.map(
      (entry, i) => `${i + 1}. **${entry.cardName}**`
    );
    const header = `${displayName} wishlist (${entries.length}/${gameConfig.maxWishlistSlots}):`;

    await interaction.reply({
      content: `${header}\n${lines.join("\n")}`,
      ephemeral: true
    });
  }
};
