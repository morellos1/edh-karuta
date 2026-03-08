import {
  AttachmentBuilder,
  ChatInputCommandInteraction,
  SlashCommandBuilder
} from "discord.js";
import { gameConfig } from "../config.js";
import type { SlashCommand } from "./types.js";
import { getRandomDroppableCards } from "../repositories/cardRepo.js";
import { getDropCooldownRemainingMs, setDropUsed } from "../repositories/botConfigRepo.js";
import { buildDropCollage } from "../services/collageService.js";
import { attachDropMessage, createDropRecord } from "../services/dropService.js";
import { buildDropComponents, scheduleDropTimeout } from "../interactions/claimButton.js";
import { buildWishlistNotification } from "../services/wishlistService.js";
import { formatCooldownRemaining } from "../utils/cooldownFormatting.js";

const DROP_SIZE = 3;

export const dropCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("drop")
    .setDescription("Drop 3 random MTG cards for claiming."),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guildId) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        ephemeral: true
      });
      return;
    }

    if (gameConfig.dropCooldownSeconds > 0) {
      const remainingMs = await getDropCooldownRemainingMs(interaction.user.id);
      if (remainingMs > 0) {
        await interaction.reply({
          content: `<@${interaction.user.id}>, you must wait ${formatCooldownRemaining(remainingMs)} before dropping more cards.`,
          ephemeral: true
        });
        return;
      }
    }

    await interaction.deferReply();

    try {
      const cards = await getRandomDroppableCards(DROP_SIZE);
      const expiresAt = new Date(Date.now() + gameConfig.dropExpireSeconds * 1000);
      const drop = await createDropRecord({
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        dropperUserId: interaction.user.id,
        expiresAt,
        cards
      });

      if (gameConfig.dropCooldownSeconds > 0) {
        await setDropUsed(interaction.user.id);
      }

      const collage = await buildDropCollage(cards);
      const attachment = new AttachmentBuilder(collage, { name: "drop.webp" });
      const components = await buildDropComponents(drop.id);

      const isBotDrop = interaction.user.id === interaction.client.user?.id;
      const dropLine = isBotDrop
        ? "I'm dropping 3 cards!"
        : `<@${interaction.user.id}> is dropping 3 cards!`;

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
        content: `Drop failed: ${(error as Error).message}`
      });
    }
  }
};
