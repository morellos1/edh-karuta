import {
  AttachmentBuilder,
  ChatInputCommandInteraction,
  SlashCommandBuilder
} from "discord.js";
import { gameConfig } from "../config.js";
import type { SlashCommand } from "./types.js";
import { getRandomLandCards } from "../repositories/cardRepo.js";
import { getLanddropCooldownRemainingMs, setLanddropUsed } from "../repositories/botConfigRepo.js";
import { consumeExtraLandDropTx } from "../repositories/extraLandDropRepo.js";
import { prisma } from "../db.js";
import { buildDropCollage } from "../services/collageService.js";
import { attachDropMessage, createDropRecord } from "../services/dropService.js";
import { buildDropComponents, scheduleDropTimeout } from "../interactions/claimButton.js";
import { buildWishlistNotification } from "../services/wishlistService.js";
import { formatCooldownRemaining } from "../utils/cooldownFormatting.js";
import { createAsyncLock } from "../utils/asyncLock.js";

const DROP_SIZE = 3;
const withLanddropLock = createAsyncLock();

export const landdropCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("landdrop")
    .setDescription("Drop 3 random nonbasic land cards (2h cooldown)."),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guildId) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        ephemeral: true
      });
      return;
    }

    let usedExtraLandDrop: number | null = null;
    const blocked = await withLanddropLock(interaction.user.id, async () => {
      const remainingMs = await getLanddropCooldownRemainingMs(interaction.user.id);
      if (remainingMs > 0) {
        // Try to consume an extra landdrop
        const remaining = await prisma.$transaction(async (tx) => {
          return consumeExtraLandDropTx(tx, interaction.user.id);
        });
        if (remaining === null) {
          await interaction.reply({
            content: `Land Drop is on cooldown. Try again ${formatCooldownRemaining(remainingMs)}.`,
            ephemeral: true
          });
          return true;
        }
        usedExtraLandDrop = remaining;
        // Don't reset the default cooldown — it keeps ticking in the background
        return false;
      }
      await setLanddropUsed(interaction.user.id);
      return false;
    });
    if (blocked) return;

    await interaction.deferReply();

    try {
      const cards = await getRandomLandCards(DROP_SIZE);
      const expiresAt = new Date(Date.now() + gameConfig.dropExpireSeconds * 1000);
      const drop = await createDropRecord({
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        dropperUserId: interaction.user.id,
        expiresAt,
        cards,
        dropType: "landdrop"
      });

      const collage = await buildDropCollage(cards);
      const attachment = new AttachmentBuilder(collage, { name: "drop.webp" });
      const components = buildDropComponents(drop);

      const dropLine = `<@${interaction.user.id}> is dropping 3 nonbasic land cards!`;

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

      if (usedExtraLandDrop !== null) {
        await interaction.followUp({
          content: `<@${interaction.user.id}>, your Extra LandDrop has been consumed. You have ${usedExtraLandDrop} remaining.`
        });
      }
    } catch (error) {
      await interaction.editReply({
        content: `Land Drop failed: ${(error as Error).message}`
      });
    }
  }
};
