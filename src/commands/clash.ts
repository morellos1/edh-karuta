import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  SlashCommandBuilder
} from "discord.js";
import type { SlashCommand } from "./types.js";
import { prisma } from "../db.js";
import { buildClashStats, isLegendaryCreature } from "../services/clashService.js";
import { getCardImageUrl } from "../utils/cardFormatting.js";
import { buildChallengeEmbed } from "../utils/clashFormatting.js";
import { gameConfig } from "../config.js";

export const CLASH_ACCEPT_PREFIX = "clash_accept";
export const CLASH_DECLINE_PREFIX = "clash_decline";

export const clashCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("clash")
    .setDescription("Challenge other players to a Clash battle with your set creature!"),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guildId) {
      await interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
      return;
    }

    // Look up the user's set creature
    const clashCreature = await prisma.clashCreature.findUnique({
      where: {
        discordId_guildId: {
          discordId: interaction.user.id,
          guildId: interaction.guildId
        }
      },
      include: {
        userCard: { include: { card: true } }
      }
    });

    if (!clashCreature) {
      await interaction.reply({
        content: "You haven't set a creature yet! Use `/setcreature <id>` first.",
        ephemeral: true
      });
      return;
    }

    // Verify they still own the card
    if (clashCreature.userCard.userId !== interaction.user.id) {
      await prisma.clashCreature.delete({ where: { id: clashCreature.id } });
      await interaction.reply({
        content: "You no longer own your set creature. Use `/setcreature <id>` to set a new one.",
        ephemeral: true
      });
      return;
    }

    // Verify it's still a legendary creature (shouldn't change but be safe)
    if (!isLegendaryCreature(clashCreature.userCard.card.typeLine, { isMeldResult: clashCreature.userCard.card.isMeldResult })) {
      await prisma.clashCreature.delete({ where: { id: clashCreature.id } });
      await interaction.reply({
        content: "Your set creature is no longer eligible. Use `/setcreature <id>` to set a new one.",
        ephemeral: true
      });
      return;
    }

    const stats = buildClashStats(clashCreature.userCard.card, clashCreature.userCard.condition);
    const imageUrl = getCardImageUrl(clashCreature.userCard.card);
    const embed = buildChallengeEmbed(interaction.user.displayName, stats, imageUrl);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${CLASH_ACCEPT_PREFIX}:${interaction.user.id}`)
        .setLabel("Accept")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`${CLASH_DECLINE_PREFIX}:${interaction.user.id}`)
        .setLabel("Decline")
        .setStyle(ButtonStyle.Danger)
    );

    const reply = await interaction.reply({
      embeds: [embed],
      components: [row],
      fetchReply: true
    });

    // Schedule challenge expiry
    const expireMs = gameConfig.clash.challengeExpireSeconds * 1000;
    setTimeout(async () => {
      try {
        const msg = await interaction.channel?.messages.fetch(reply.id).catch(() => null);
        if (msg && msg.components.length > 0) {
          const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(`${CLASH_ACCEPT_PREFIX}:expired`)
              .setLabel("Expired")
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true)
          );
          await msg.edit({ components: [disabledRow] });
        }
      } catch {
        // Ignore — message may have been deleted
      }
    }, expireMs);
  }
};
