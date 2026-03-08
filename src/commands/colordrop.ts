import {
  AttachmentBuilder,
  ChatInputCommandInteraction,
  SlashCommandBuilder
} from "discord.js";
import { gameConfig } from "../config.js";
import type { SlashCommand } from "./types.js";
import { getRandomDroppableCards, type DropColorSymbol } from "../repositories/cardRepo.js";
import { getColordropCooldownRemainingMs, setColordropUsed } from "../repositories/botConfigRepo.js";
import { buildDropCollage } from "../services/collageService.js";
import { attachDropMessage, createDropRecord } from "../services/dropService.js";
import { buildDropComponents, scheduleDropTimeout } from "../interactions/claimButton.js";
import { buildWishlistNotification } from "../services/wishlistService.js";

const DROP_SIZE = 3;
const COLOR_SYMBOL_MAP: Record<string, DropColorSymbol> = {
  white: "W",
  blue: "U",
  black: "B",
  red: "R",
  green: "G"
};

export const colordropCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("colordrop")
    .setDescription("Drop 3 random cards with a specific color identity (12h cooldown).")
    .addStringOption((opt) =>
      opt
        .setName("color")
        .setDescription("Color identity to target")
        .setRequired(true)
        .addChoices(
          { name: "white", value: "white" },
          { name: "blue", value: "blue" },
          { name: "black", value: "black" },
          { name: "red", value: "red" },
          { name: "green", value: "green" }
        )
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guildId) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        ephemeral: true
      });
      return;
    }

    const remainingMs = await getColordropCooldownRemainingMs(interaction.user.id);
    if (remainingMs > 0) {
      const minutes = Math.ceil(remainingMs / 60_000);
      await interaction.reply({
        content: `Color Drop is on cooldown. Try again in **${minutes}** minute${minutes !== 1 ? "s" : ""}.`,
        ephemeral: true
      });
      return;
    }

    await interaction.deferReply();

    try {
      const colorChoice = interaction.options.getString("color", true);
      const colorSymbol = COLOR_SYMBOL_MAP[colorChoice];
      const cards = await getRandomDroppableCards(DROP_SIZE, colorSymbol);
      const expiresAt = new Date(Date.now() + gameConfig.dropExpireSeconds * 1000);
      const drop = await createDropRecord({
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        dropperUserId: interaction.user.id,
        expiresAt,
        cards,
        dropType: "colordrop"
      });

      await setColordropUsed(interaction.user.id);

      const collage = await buildDropCollage(cards);
      const attachment = new AttachmentBuilder(collage, { name: "drop.webp" });
      const components = await buildDropComponents(drop.id);

      const dropLine = `<@${interaction.user.id}> is dropping 3 cards! (${colorChoice})`;

      const wishNotification = await buildWishlistNotification(
        interaction.guildId,
        cards.map((c) => c.name)
      );
      const content = wishNotification
        ? `${wishNotification}\n\n${dropLine}`
        : dropLine;

      const message = await interaction.editReply({
        content,
        files: [attachment],
        components
      });

      await attachDropMessage(drop.id, message.id);
      scheduleDropTimeout(interaction.client, {
        dropId: drop.id,
        channelId: interaction.channelId,
        messageId: message.id,
        expiresAt
      });
    } catch (error) {
      await interaction.editReply({
        content: `Color Drop failed: ${(error as Error).message}`
      });
    }
  }
};
