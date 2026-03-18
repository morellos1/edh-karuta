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
import {
  buildBattleEmbed,
  buildVictoryEmbed
} from "../utils/clashFormatting.js";
import { buildClashPairImage, buildDropCollage } from "../services/collageService.js";
import {
  getDailyBoss,
  hasClaimedDailyReward,
  markDailyRewardClaimed,
  getRewardCards,
  type DailyBossInfo
} from "../services/dailyRaidService.js";
import { pickRandomCondition } from "../services/conditionService.js";
import { rollClashBonuses } from "../services/clashBonusService.js";
import { generateDisplayId } from "../utils/displayId.js";
import { DAILYRAID_CHALLENGE_PREFIX, DAILYRAID_RUN_PREFIX } from "../commands/dailyraid.js";

/** Set of message IDs with active battles to prevent double-clicks. */
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
  if (record.userCard.userId !== userId) return null;
  if (!isLegendaryCreature(record.userCard.card.typeLine, { isMeldResult: record.userCard.card.isMeldResult })) return null;
  return record;
}

export async function handleDailyRaidButtons(interaction: ButtonInteraction) {
  const customId = interaction.customId;

  // Run Away button
  if (customId.startsWith(`${DAILYRAID_RUN_PREFIX}:`)) {
    const ownerId = customId.split(":")[1];
    if (interaction.user.id !== ownerId) {
      await interaction.reply({ content: "Only the raid initiator can run away.", ephemeral: true });
      return;
    }
    const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("dailyraid_ranaway")
        .setLabel("Ran Away!")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
    );
    await interaction.update({ components: [disabledRow] });
    return;
  }

  // Challenge button
  if (!customId.startsWith(`${DAILYRAID_CHALLENGE_PREFIX}:`)) return;

  const ownerId = customId.split(":")[1];
  if (interaction.user.id !== ownerId) {
    await interaction.reply({ content: "Only the raid initiator can challenge the boss.", ephemeral: true });
    return;
  }

  const guildId = interaction.guildId;
  if (!guildId) return;

  const messageId = interaction.message.id;
  if (activeBattles.has(messageId)) {
    await interaction.reply({ content: "A battle is already in progress!", ephemeral: true });
    return;
  }
  activeBattles.add(messageId);

  try {
    // Load player's commander
    const playerData = await loadClashCreature(interaction.user.id, guildId);
    if (!playerData) {
      await interaction.reply({
        content: "You haven't set a commander or it's no longer available! Use `/setcommander <id>` first.",
        ephemeral: true
      });
      activeBattles.delete(messageId);
      return;
    }

    // Get today's boss
    const boss: DailyBossInfo = await getDailyBoss();

    const playerStats = buildClashStats(playerData.userCard.card, playerData.userCard.condition, playerData.userCard);
    const bossStats = boss.stats;
    const displayIdPlayer = playerData.userCard.displayId;
    const displayIdBoss = "BOSS";

    // Disable buttons
    const battleRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("dailyraid_in_progress")
        .setLabel("Battle in progress...")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
    );

    // Build VS collage image
    let clashAttachment: AttachmentBuilder | null = null;
    try {
      const collage = await buildClashPairImage(playerData.userCard.card, boss.card);
      clashAttachment = new AttachmentBuilder(collage, { name: "clash.webp" });
    } catch {
      // Continue without image if generation fails
    }

    // Simulate battle (player = a, boss = b)
    const maxAttacks = gameConfig.clash.maxAttacks;
    const result = simulateBattle(playerStats, bossStats, maxAttacks);
    const delayMs = gameConfig.clash.editDelayMs;

    // Start battle display
    const initialEmbed = buildBattleEmbed(playerStats, bossStats, [], 0, maxAttacks, displayIdPlayer, displayIdBoss);
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
        const victoryEmbed = buildVictoryEmbed(result, playerStats, bossStats, displayIdPlayer, displayIdBoss);
        if (clashAttachment) victoryEmbed.setImage("attachment://clash.webp");
        await interaction.editReply({
          embeds: [victoryEmbed],
          components: []
        });
      } else {
        const battleEmbed = buildBattleEmbed(
          playerStats, bossStats, eventsUpToNow, i + 1, maxAttacks, displayIdPlayer, displayIdBoss
        );
        if (clashAttachment) battleEmbed.setImage("attachment://clash.webp");
        await interaction.editReply({
          embeds: [battleEmbed],
          components: [battleRow]
        });
      }
    }

    // Determine if player won
    const playerWon = result.winner === playerStats.name;

    if (playerWon) {
      const alreadyClaimed = await hasClaimedDailyReward(interaction.user.id);

      if (!alreadyClaimed) {
        // Get reward cards and create records
        const rewardCards = await getRewardCards(boss.card);

        // Create a Drop record for the raid reward
        const drop = await prisma.drop.create({
          data: {
            guildId,
            channelId: interaction.channelId,
            dropperUserId: interaction.user.id,
            dropType: "dailyraid",
            expiresAt: new Date(), // Already resolved
            resolvedAt: new Date(),
            slots: {
              create: rewardCards.map((card, idx) => ({
                slotIndex: idx,
                cardId: card.id,
                claimedByUserId: interaction.user.id,
                claimedAt: new Date()
              }))
            }
          }
        });

        // Create UserCard records for each reward card
        const createdCards: { name: string; displayId: string }[] = [];
        for (const card of rewardCards) {
          const condition = pickRandomCondition();
          const isClashEligible = isLegendaryCreature(card.typeLine, { isMeldResult: false });
          const bonuses = isClashEligible ? rollClashBonuses(condition) : {};

          let userCard;
          for (let attempt = 0; attempt < 5; attempt++) {
            try {
              userCard = await prisma.userCard.create({
                data: {
                  displayId: generateDisplayId(),
                  userId: interaction.user.id,
                  cardId: card.id,
                  dropId: drop.id,
                  condition,
                  ...bonuses
                }
              });
              break;
            } catch (err: unknown) {
              const isUniqueViolation =
                err != null &&
                typeof err === "object" &&
                "code" in err &&
                (err as { code: string }).code === "P2002";
              if (!isUniqueViolation || attempt === 4) throw err;
            }
          }

          createdCards.push({ name: card.name, displayId: userCard!.displayId });
        }

        await markDailyRewardClaimed(interaction.user.id);

        // Build reward image
        let rewardAttachment: AttachmentBuilder | null = null;
        try {
          const collage = await buildDropCollage(rewardCards);
          rewardAttachment = new AttachmentBuilder(collage, { name: "reward.webp" });
        } catch {
          // Continue without image
        }

        // Format reward message
        const cardList = createdCards.map((c) => `**${c.name}** \`${c.displayId}\``);
        const cardText = cardList.length === 3
          ? `${cardList[0]}, ${cardList[1]} and ${cardList[2]}`
          : cardList.join(", ");

        await interaction.followUp({
          content: `<@${interaction.user.id}> has defeated **${bossStats.name}** and received ${cardText}!`,
          files: rewardAttachment ? [rewardAttachment] : []
        });
      } else {
        await interaction.followUp({
          content: `<@${interaction.user.id}> defeated **${bossStats.name}**! You've already claimed today's raid reward.`
        });
      }
    } else {
      await interaction.followUp({
        content: `<@${interaction.user.id}> was defeated by **${bossStats.name}**! Try again — you can challenge the raid boss any number of times.`
      });
    }
  } catch (error) {
    console.error("Daily raid battle error:", error);
    try {
      await interaction.editReply({
        content: "An error occurred during the raid battle.",
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
