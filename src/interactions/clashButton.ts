import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle
} from "discord.js";
import { prisma } from "../db.js";
import { gameConfig } from "../config.js";
import {
  buildClashStats,
  isLegendaryCreature,
  simulateBattle,
  type ClashStats
} from "../services/clashService.js";
import { getCardImageUrl } from "../utils/cardFormatting.js";
import {
  buildBattleEmbed,
  buildVictoryEmbed
} from "../utils/clashFormatting.js";
import { buildClashPairImage } from "../services/collageService.js";
import { CLASH_ACCEPT_PREFIX, CLASH_DECLINE_PREFIX } from "../commands/clash.js";

/** Set of message IDs with active battles to prevent double-accepts. */
const activeBattles = new Set<string>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadClashCreature(userId: string, guildId: string) {
  const record = await prisma.clashCreature.findUnique({
    where: {
      discordId_guildId: { discordId: userId, guildId }
    },
    include: {
      userCard: { include: { card: true } }
    }
  });
  if (!record) return null;
  // Verify ownership
  if (record.userCard.userId !== userId) return null;
  if (!isLegendaryCreature(record.userCard.card.typeLine, { isMeldResult: record.userCard.card.isMeldResult })) return null;
  return record;
}

export async function handleClashButtons(interaction: ButtonInteraction) {
  const customId = interaction.customId;

  // Decline button
  if (customId.startsWith(`${CLASH_DECLINE_PREFIX}:`)) {
    const challengerId = customId.split(":")[1];
    // Only the challenger can decline/cancel their own challenge
    if (interaction.user.id !== challengerId) {
      await interaction.reply({
        content: "Only the challenger can cancel this challenge.",
        ephemeral: true
      });
      return;
    }
    const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("clash_cancelled")
        .setLabel("Cancelled")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
    );
    await interaction.update({ components: [disabledRow] });
    return;
  }

  // Accept button
  if (!customId.startsWith(`${CLASH_ACCEPT_PREFIX}:`)) return;

  const challengerId = customId.split(":")[1];
  if (challengerId === "expired") {
    await interaction.reply({ content: "This challenge has expired.", ephemeral: true });
    return;
  }

  const accepterId = interaction.user.id;
  const guildId = interaction.guildId;
  if (!guildId) return;

  // Can't fight yourself
  if (accepterId === challengerId) {
    await interaction.reply({ content: "You can't fight yourself!", ephemeral: true });
    return;
  }

  // Prevent double-accepts
  const messageId = interaction.message.id;
  if (activeBattles.has(messageId)) {
    await interaction.reply({ content: "A battle is already starting!", ephemeral: true });
    return;
  }
  activeBattles.add(messageId);

  try {
    // Load both creatures
    const [challengerData, accepterData] = await Promise.all([
      loadClashCreature(challengerId, guildId),
      loadClashCreature(accepterId, guildId)
    ]);

    if (!challengerData) {
      await interaction.reply({
        content: "The challenger's commander is no longer available. Challenge cancelled.",
        ephemeral: true
      });
      // Disable buttons
      const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("clash_invalid")
          .setLabel("Cancelled")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
      );
      await interaction.message.edit({ components: [disabledRow] });
      return;
    }

    if (!accepterData) {
      await interaction.reply({
        content: "You haven't set a commander or it's no longer available! Use `/setcommander <id>` first.",
        ephemeral: true
      });
      activeBattles.delete(messageId);
      return;
    }

    const statsA = buildClashStats(challengerData.userCard.card, challengerData.userCard.condition, challengerData.userCard);
    const statsB = buildClashStats(accepterData.userCard.card, accepterData.userCard.condition, accepterData.userCard);
    const imageUrlA = getCardImageUrl(challengerData.userCard.card);
    const imageUrlB = getCardImageUrl(accepterData.userCard.card);
    const displayIdA = challengerData.userCard.displayId;
    const displayIdB = accepterData.userCard.displayId;

    // Disable buttons
    const battleRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("clash_in_progress")
        .setLabel("Battle in progress...")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
    );

    // Build VS collage image
    let clashAttachment: AttachmentBuilder | null = null;
    try {
      const collage = await buildClashPairImage(challengerData.userCard.card, accepterData.userCard.card);
      clashAttachment = new AttachmentBuilder(collage, { name: "clash.webp" });
    } catch {
      // If image generation fails, continue without it
    }

    // Run the simulation
    const maxAttacks = gameConfig.clash.maxAttacks;
    const result = simulateBattle(statsA, statsB, maxAttacks);
    const delayMs = gameConfig.clash.editDelayMs;

    // Start the battle display
    const initialEmbed = buildBattleEmbed(statsA, statsB, [], 0, maxAttacks, imageUrlA, imageUrlB, displayIdA, displayIdB);
    if (clashAttachment) initialEmbed.setImage("attachment://clash.webp");
    await interaction.update({
      embeds: [initialEmbed],
      components: [battleRow],
      files: clashAttachment ? [clashAttachment] : []
    });

    // Play back events with delays
    for (let i = 0; i < result.events.length; i++) {
      await sleep(delayMs);

      const eventsUpToNow = result.events.slice(0, i + 1);

      if (i === result.events.length - 1) {
        // Final event — show victory embed
        const victoryEmbed = buildVictoryEmbed(result, statsA, statsB, displayIdA, displayIdB);
        if (clashAttachment) victoryEmbed.setImage("attachment://clash.webp");
        await interaction.editReply({
          embeds: [victoryEmbed],
          components: []
        });
      } else {
        const battleEmbed = buildBattleEmbed(
          statsA, statsB, eventsUpToNow, i + 1, maxAttacks, imageUrlA, imageUrlB, displayIdA, displayIdB
        );
        if (clashAttachment) battleEmbed.setImage("attachment://clash.webp");
        await interaction.editReply({
          embeds: [battleEmbed],
          components: [battleRow]
        });
      }
    }

    // Update W/L records — outside display loop so it runs even if display errors occur
    const winnerId = result.winner === statsA.name ? challengerId : accepterId;
    const loserId = result.winner === statsA.name ? accepterId : challengerId;
    try {
      await Promise.all([
        prisma.clashCreature.updateMany({
          where: { discordId: winnerId, guildId },
          data: { clashWins: { increment: 1 } }
        }),
        prisma.clashCreature.updateMany({
          where: { discordId: loserId, guildId },
          data: { clashLosses: { increment: 1 } }
        })
      ]);
    } catch (err) {
      console.error("Failed to update clash records:", err);
    }

    // Send a separate victory announcement mentioning both users
    await interaction.followUp({
      content: `<@${winnerId}> has defeated <@${loserId}> in a clash battle!`
    });
  } catch (error) {
    console.error("Clash battle error:", error);
    try {
      await interaction.editReply({
        content: "An error occurred during the battle.",
        embeds: [],
        components: []
      });
    } catch {
      // Ignore
    }
  } finally {
    activeBattles.delete(messageId);
  }
}
