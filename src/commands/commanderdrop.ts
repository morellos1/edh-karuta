import {
  AttachmentBuilder,
  ChatInputCommandInteraction,
  SlashCommandBuilder
} from "discord.js";
import { gameConfig } from "../config.js";
import type { SlashCommand } from "./types.js";
import { getRandomCommanderCards } from "../repositories/cardRepo.js";
import { getCommanderdropCooldownRemainingMs, setCommanderdropUsed } from "../repositories/botConfigRepo.js";
import { consumeExtraCommanderDropTx } from "../repositories/extraCommanderDropRepo.js";
import { prisma } from "../db.js";
import { buildDropCollage } from "../services/collageService.js";
import { attachDropMessage, createDropRecord } from "../services/dropService.js";
import { buildDropComponents, scheduleDropTimeout } from "../interactions/claimButton.js";
import { buildWishlistNotification } from "../services/wishlistService.js";
import { formatCooldownRemaining } from "../utils/cooldownFormatting.js";
import { createAsyncLock } from "../utils/asyncLock.js";

const DROP_SIZE = 3;
const withCommanderdropLock = createAsyncLock();

export const commanderdropCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("commanderdrop")
    .setDescription("Drop 3 random commander-eligible cards (24h cooldown)."),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guildId) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        ephemeral: true
      });
      return;
    }

    let usedExtraCommanderDrop: number | null = null;
    const blocked = await withCommanderdropLock(interaction.user.id, async () => {
      const remainingMs = await getCommanderdropCooldownRemainingMs(interaction.user.id);
      if (remainingMs > 0) {
        // Try to consume an extra commanderdrop
        const remaining = await prisma.$transaction(async (tx) => {
          return consumeExtraCommanderDropTx(tx, interaction.user.id);
        });
        if (remaining === null) {
          await interaction.reply({
            content: `Commander Drop is on cooldown. Try again ${formatCooldownRemaining(remainingMs)}.`,
            ephemeral: true
          });
          return true;
        }
        usedExtraCommanderDrop = remaining;
        // Don't reset the default cooldown — it keeps ticking in the background
        return false;
      }
      await setCommanderdropUsed(interaction.user.id);
      return false;
    });
    if (blocked) return;

    await interaction.deferReply();

    try {
      const cards = await getRandomCommanderCards(DROP_SIZE);
      const expiresAt = new Date(Date.now() + gameConfig.dropExpireSeconds * 1000);
      const drop = await createDropRecord({
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        dropperUserId: interaction.user.id,
        expiresAt,
        cards,
        dropType: "commanderdrop"
      });

      const collage = await buildDropCollage(cards);
      const attachment = new AttachmentBuilder(collage, { name: "drop.webp" });
      const components = buildDropComponents(drop);

      const dropLine = `<@${interaction.user.id}> is dropping 3 commander cards!`;

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

      if (usedExtraCommanderDrop !== null) {
        await interaction.followUp({
          content: `<@${interaction.user.id}>, your Extra CommanderDrop has been consumed. You have ${usedExtraCommanderDrop} remaining.`
        });
      }
    } catch (error) {
      console.error("[COMMANDERDROP]", error);
      await interaction.editReply({
        content: `Commander Drop failed: ${(error as Error).message}`
      });
    }
  }
};
