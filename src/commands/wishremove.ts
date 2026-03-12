import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import type { SlashCommand } from "./types.js";
import { removeWishlistEntry } from "../repositories/wishlistRepo.js";
import { findCardByQuery } from "../repositories/cardRepo.js";

export const wishremoveCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("wishremove")
    .setDescription("Remove a card from your wishlist.")
    .addStringOption((opt) =>
      opt
        .setName("cardname")
        .setDescription("The card name to remove")
        .setRequired(true)
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guildId) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        ephemeral: true
      });
      return;
    }

    const cardName = interaction.options.getString("cardname", true).trim();

    // Try to resolve the input to an exact card name via fuzzy matching
    const card = await findCardByQuery(cardName);
    if (card) {
      const removed = await removeWishlistEntry(
        interaction.user.id,
        interaction.guildId,
        card.name
      );
      if (removed) {
        await interaction.reply({
          content: `Removed **${card.name}** from your wishlist.`,
          ephemeral: true
        });
        return;
      }
    }

    // If card DB lookup didn't match a wishlist entry, try the raw input directly
    const removed = await removeWishlistEntry(
      interaction.user.id,
      interaction.guildId,
      cardName
    );

    if (!removed) {
      await interaction.reply({
        content: `**${cardName}** was not found on your wishlist. Use \`/wl\` to view your wishlist.`,
        ephemeral: true
      });
      return;
    }

    await interaction.reply({
      content: `Removed **${cardName}** from your wishlist.`,
      ephemeral: true
    });
  }
};
