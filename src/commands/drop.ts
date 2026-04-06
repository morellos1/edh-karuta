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
import { createAsyncLock } from "../utils/asyncLock.js";

const DROP_SIZE = 3;
const withDropLock = createAsyncLock();

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
      const blocked = await withDropLock(interaction.user.id, async () => {
        const remainingMs = await getDropCooldownRemainingMs(interaction.user.id);
        if (remainingMs > 0) {
          await interaction.reply({
            content: `<@${interaction.user.id}>, you can drop again ${formatCooldownRemaining(remainingMs)}.`,
            ephemeral: true
          });
          return true;
        }
        await setDropUsed(interaction.user.id);
        return false;
      });
      if (blocked) return;
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

      const collage = await buildDropCollage(cards);
      const attachment = new AttachmentBuilder(collage, { name: "drop.webp" });
      const components = buildDropComponents(drop);

      const isBotDrop = interaction.user.id === interaction.client.user?.id;
      const dropLine = isBotDrop
        ? "I'm dropping 3 cards!"
        : `<@${interaction.user.id}> is dropping 3 cards!`;

      const wishNotification = await buildWishlistNotification(
        interaction.guildId,
        cards.map((c) => c.name)
      );
      if (wishNotification && interaction.channel && "send" in interaction.channel) {
        await interaction.channel.send(wishNotification);
      }

      const message = await interaction.editReply({
        content: dropLine,
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
      console.error("[DROP]", error);
      try {
        await interaction.editReply({
          content: `Drop failed: ${(error as Error).message}`
        });
      } catch {
        // interaction expired or connection lost; already logged above
      }
    }
  }
};
