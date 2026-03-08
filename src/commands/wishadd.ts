import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import type { SlashCommand } from "./types.js";
import { gameConfig } from "../config.js";
import { findCardByQuery } from "../repositories/cardRepo.js";
import {
  addWishlistEntry,
  getUserWishlistCount,
  wishlistEntryExists
} from "../repositories/wishlistRepo.js";

export const wishaddCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("wishadd")
    .setDescription("Add a card to your wishlist to be notified when it drops.")
    .addStringOption((opt) =>
      opt
        .setName("cardname")
        .setDescription("The card name to watch for")
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

    const query = interaction.options.getString("cardname", true);

    await interaction.deferReply({ ephemeral: true });

    const card = await findCardByQuery(query);
    if (!card) {
      await interaction.editReply({
        content: `No card found matching **${query}**.`
      });
      return;
    }

    const cardName = card.name;

    const exists = await wishlistEntryExists(
      interaction.user.id,
      interaction.guildId,
      cardName
    );
    if (exists) {
      await interaction.editReply({
        content: `**${cardName}** is already on your wishlist.`
      });
      return;
    }

    const count = await getUserWishlistCount(
      interaction.user.id,
      interaction.guildId
    );
    if (count >= gameConfig.maxWishlistSlots) {
      await interaction.editReply({
        content: `Your wishlist is full (${gameConfig.maxWishlistSlots}/${gameConfig.maxWishlistSlots}). Remove a card with \`/wishremove\` first.`
      });
      return;
    }

    await addWishlistEntry(interaction.user.id, interaction.guildId, cardName);

    await interaction.editReply({
      content: `Added **${cardName}** to your wishlist (${count + 1}/${gameConfig.maxWishlistSlots}).`
    });
  }
};
