import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  EmbedBuilder
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
  formatBattleEvent,
  hpBar
} from "../utils/clashFormatting.js";
import { buildClashPairImage } from "../services/collageService.js";
import {
  generateFloorBoss,
  updateRecord,
  claimFloorRewards,
  type FloorRewardResult
} from "../services/endlessTowerService.js";
import {
  ENDLESS_CHALLENGE_PREFIX,
  ENDLESS_CANCEL_PREFIX
} from "../commands/endless.js";

// ---------------------------------------------------------------------------
// Session State
// ---------------------------------------------------------------------------

type EndlessTowerSession = {
  guildId: string;
  userCardId: number;
  commanderStats: ClashStats;
  displayIdPlayer: string;
  floorsCleared: number; // how many floors have been defeated
  inBattle: boolean;
};

const activeSessions = new Map<string, EndlessTowerSession>();

function sessionKey(userId: string, guildId: string): string {
  return `${userId}-${guildId}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Button Prefix Constants
// ---------------------------------------------------------------------------

export const ENDLESS_PROCEED_PREFIX = "endless_proceed";
export const ENDLESS_STOP_PREFIX = "endless_stop";

// ---------------------------------------------------------------------------
// Main Handler
// ---------------------------------------------------------------------------

export async function handleEndlessTowerButtons(interaction: ButtonInteraction) {
  const customId = interaction.customId;

  if (customId.startsWith(`${ENDLESS_CANCEL_PREFIX}:`)) {
    await handleCancel(interaction);
    return;
  }

  if (customId.startsWith(`${ENDLESS_CHALLENGE_PREFIX}:`)) {
    await handleChallenge(interaction);
    return;
  }

  if (customId.startsWith(`${ENDLESS_PROCEED_PREFIX}:`)) {
    await handleProceed(interaction);
    return;
  }

  if (customId.startsWith(`${ENDLESS_STOP_PREFIX}:`)) {
    await handleStop(interaction);
    return;
  }
}

// ---------------------------------------------------------------------------
// Cancel
// ---------------------------------------------------------------------------

async function handleCancel(interaction: ButtonInteraction) {
  const ownerId = interaction.customId.split(":")[1];
  if (interaction.user.id !== ownerId) {
    await interaction.reply({ content: "Only the challenger can cancel.", ephemeral: true });
    return;
  }

  const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("endless_cancelled")
      .setLabel("Cancelled")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  );
  await interaction.update({ components: [disabledRow] });
}

// ---------------------------------------------------------------------------
// Challenge (start floor 1)
// ---------------------------------------------------------------------------

async function handleChallenge(interaction: ButtonInteraction) {
  const ownerId = interaction.customId.split(":")[1];
  if (interaction.user.id !== ownerId) {
    await interaction.reply({ content: "Only the challenger can start.", ephemeral: true });
    return;
  }

  const guildId = interaction.guildId;
  if (!guildId) return;

  const key = sessionKey(interaction.user.id, guildId);
  if (activeSessions.has(key)) {
    await interaction.reply({ content: "You already have an active Endless Tower session!", ephemeral: true });
    return;
  }

  // Load player's commander
  const playerData = await loadClashCreature(interaction.user.id, guildId);
  if (!playerData) {
    await interaction.reply({
      content: "You haven't set a commander or it's no longer available! Use `/setcommander <id>` first.",
      ephemeral: true
    });
    return;
  }

  const playerStats = buildClashStats(playerData.userCard.card, playerData.userCard.condition, playerData.userCard);

  const session: EndlessTowerSession = {
    guildId,
    userCardId: playerData.userCard.id,
    commanderStats: playerStats,
    displayIdPlayer: playerData.userCard.displayId,
    floorsCleared: 0,
    inBattle: true
  };
  activeSessions.set(key, session);

  try {
    await runFloorBattle(interaction, session, 1);
  } catch (error) {
    activeSessions.delete(key);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Proceed to next floor
// ---------------------------------------------------------------------------

async function handleProceed(interaction: ButtonInteraction) {
  const ownerId = interaction.customId.split(":")[1];
  if (interaction.user.id !== ownerId) {
    await interaction.reply({ content: "Only the challenger can proceed.", ephemeral: true });
    return;
  }

  const guildId = interaction.guildId;
  if (!guildId) return;

  const key = sessionKey(interaction.user.id, guildId);
  const session = activeSessions.get(key);
  if (!session) {
    await interaction.reply({ content: "No active Endless Tower session found.", ephemeral: true });
    return;
  }

  if (session.inBattle) {
    await interaction.reply({ content: "A battle is already in progress!", ephemeral: true });
    return;
  }

  session.inBattle = true;
  const nextFloor = session.floorsCleared + 1;

  try {
    await runFloorBattle(interaction, session, nextFloor);
  } catch (error) {
    activeSessions.delete(key);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Stop (save progress and end)
// ---------------------------------------------------------------------------

async function handleStop(interaction: ButtonInteraction) {
  const ownerId = interaction.customId.split(":")[1];
  if (interaction.user.id !== ownerId) {
    await interaction.reply({ content: "Only the challenger can stop.", ephemeral: true });
    return;
  }

  const guildId = interaction.guildId;
  if (!guildId) return;

  const key = sessionKey(interaction.user.id, guildId);
  const session = activeSessions.get(key);
  if (!session) {
    await interaction.reply({ content: "No active Endless Tower session found.", ephemeral: true });
    return;
  }

  // Save record
  if (session.floorsCleared > 0) {
    await updateRecord(interaction.user.id, guildId, session.userCardId, session.floorsCleared);
  }

  activeSessions.delete(key);

  const embed = new EmbedBuilder()
    .setTitle("Endless Tower - Run Complete")
    .setColor(0xffa500)
    .setDescription(
      `**${session.commanderStats.name}** has left the Endless Tower.\n\n` +
      `Floors Cleared: **${session.floorsCleared}**`
    );

  const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("endless_stopped")
      .setLabel(`Stopped at Floor ${session.floorsCleared}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  );

  await interaction.update({ embeds: [embed], components: [disabledRow] });
}

// ---------------------------------------------------------------------------
// Battle Logic
// ---------------------------------------------------------------------------

async function runFloorBattle(
  interaction: ButtonInteraction,
  session: EndlessTowerSession,
  floor: number
) {
  const guildId = session.guildId;
  const playerStats = session.commanderStats;
  const displayIdPlayer = session.displayIdPlayer;

  try {
    // Generate floor boss
    const boss = await generateFloorBoss(floor);
    const bossStats = boss.stats;
    const displayIdBoss = `F${floor}`;

    // Disable buttons during battle
    const battleRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("endless_in_progress")
        .setLabel(`Floor ${floor} - Battle in progress...`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
    );

    // Build VS collage image
    let clashAttachment: AttachmentBuilder | null = null;
    try {
      const collage = await buildClashPairImage(
        { imagePng: null, imageNormal: null, imageLarge: null, imageSmall: null, name: playerStats.name } as any,
        boss.card
      );
      clashAttachment = new AttachmentBuilder(collage, { name: "clash.webp" });
    } catch {
      // Continue without image
    }

    // Simulate battle (player = a, boss = b)
    const maxAttacks = gameConfig.clash.maxAttacks;
    const result = simulateBattle(playerStats, bossStats, maxAttacks);
    const delayMs = gameConfig.clash.editDelayMs;

    // Start battle display
    const initialEmbed = buildBattleEmbed(playerStats, bossStats, [], 0, maxAttacks, displayIdPlayer, displayIdBoss);
    initialEmbed.setTitle(`Endless Tower - Floor ${floor}`);
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
        // Final event - show result
        const playerWon = result.winner === playerStats.name;

        if (playerWon) {
          session.floorsCleared = floor;
          session.inBattle = false;

          // Claim rewards
          const rewards = await claimFloorRewards(
            interaction.user.id,
            floor,
            boss.card,
            guildId,
            interaction.channelId
          );

          const resultEmbed = buildFloorVictoryEmbed(
            result, playerStats, bossStats, displayIdPlayer, displayIdBoss, floor, rewards
          );
          if (clashAttachment) resultEmbed.setImage("attachment://clash.webp");

          const nextFloor = floor + 1;
          const proceedRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(`${ENDLESS_PROCEED_PREFIX}:${interaction.user.id}`)
              .setLabel(`Proceed to Floor ${nextFloor}`)
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId(`${ENDLESS_STOP_PREFIX}:${interaction.user.id}`)
              .setLabel(`Stop (Record: Floor ${floor})`)
              .setStyle(ButtonStyle.Danger)
          );

          await interaction.editReply({
            embeds: [resultEmbed],
            components: [proceedRow]
          });
        } else {
          // Defeat - record is floors cleared before this one
          const finalRecord = session.floorsCleared;
          if (finalRecord > 0) {
            await updateRecord(interaction.user.id, guildId, session.userCardId, finalRecord);
          }

          const key = sessionKey(interaction.user.id, guildId);
          activeSessions.delete(key);

          const resultEmbed = buildFloorDefeatEmbed(
            result, playerStats, bossStats, displayIdPlayer, displayIdBoss, floor, finalRecord
          );
          if (clashAttachment) resultEmbed.setImage("attachment://clash.webp");

          await interaction.editReply({
            embeds: [resultEmbed],
            components: []
          });

          await interaction.followUp({
            content: `<@${interaction.user.id}> reached **Floor ${finalRecord}** of the Endless Tower with **${playerStats.name}**!`
          });
        }
      } else {
        const battleEmbed = buildBattleEmbed(
          playerStats, bossStats, eventsUpToNow, i + 1, maxAttacks, displayIdPlayer, displayIdBoss
        );
        battleEmbed.setTitle(`Endless Tower - Floor ${floor}`);
        if (clashAttachment) battleEmbed.setImage("attachment://clash.webp");
        await interaction.editReply({
          embeds: [battleEmbed],
          components: [battleRow]
        });
      }
    }
  } catch (error) {
    console.error("Endless Tower battle error:", error);
    const key = sessionKey(interaction.user.id, guildId);
    activeSessions.delete(key);
    try {
      await interaction.editReply({
        content: "An error occurred during the Endless Tower battle.",
        embeds: [],
        components: []
      });
    } catch {
      // Ignore
    }
  }
}

// ---------------------------------------------------------------------------
// Embed Builders
// ---------------------------------------------------------------------------

function buildFloorVictoryEmbed(
  result: ReturnType<typeof simulateBattle>,
  playerStats: ClashStats,
  bossStats: ClashStats,
  displayIdPlayer: string,
  displayIdBoss: string,
  floor: number,
  rewards: FloorRewardResult
): EmbedBuilder {
  const allLogLines = result.events.map(formatBattleEvent);

  const summaryLine = result.isDraw
    ? `Stalemate after ${result.events.length} turns! **${result.winner}** wins by tiebreak.`
    : result.events.length >= 100
      ? `Stalemate after ${result.events.length} turns! **${result.winner}** wins with more HP remaining.`
      : `**${result.winner}** defeats **${result.loser}** in ${result.events.length} turns!`;

  const overhead = summaryLine.length + 200;
  const maxLogChars = 4096 - overhead;
  let log = allLogLines.join("\n");
  if (log.length > maxLogChars) {
    while (log.length > maxLogChars && allLogLines.length > 1) {
      allLogLines.shift();
      log = "...\n" + allLogLines.join("\n");
    }
  }

  // Reward text
  let rewardText = "";
  if (rewards.alreadyClaimed) {
    rewardText = "\n\nRewards: Already claimed";
  } else {
    rewardText = `\n\nRewards: **${rewards.gold.toLocaleString()} gold**`;
    if (rewards.cards.length > 0) {
      const cardList = rewards.cards.map((c) => `**${c.name}** \`${c.displayId}\``).join(", ");
      rewardText += ` + ${cardList}`;
    }
  }

  const finalHpPlayer = result.winner === playerStats.name ? result.winnerHp : result.loserHp;
  const finalHpBoss = result.winner === bossStats.name ? result.winnerHp : result.loserHp;

  const embed = new EmbedBuilder()
    .setTitle(`Floor ${floor} Conquered!`)
    .setColor(0x57f287)
    .setDescription(
      `${log}\n\n${summaryLine}${rewardText}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    )
    .addFields(
      { name: `${playerStats.name}\n\`${displayIdPlayer}\``, value: hpBar(finalHpPlayer, playerStats.hp), inline: true },
      { name: "\u200b", value: "\u200b", inline: true },
      { name: `${bossStats.name}\n\`${displayIdBoss}\``, value: hpBar(finalHpBoss, bossStats.hp), inline: true }
    );

  return embed;
}

function buildFloorDefeatEmbed(
  result: ReturnType<typeof simulateBattle>,
  playerStats: ClashStats,
  bossStats: ClashStats,
  displayIdPlayer: string,
  displayIdBoss: string,
  floor: number,
  finalRecord: number
): EmbedBuilder {
  const allLogLines = result.events.map(formatBattleEvent);

  const summaryLine = result.isDraw
    ? `Stalemate after ${result.events.length} turns! **${result.winner}** wins by tiebreak.`
    : result.events.length >= 100
      ? `Stalemate after ${result.events.length} turns! **${result.winner}** wins with more HP remaining.`
      : `**${result.winner}** defeats **${result.loser}** in ${result.events.length} turns!`;

  const overhead = summaryLine.length + 200;
  const maxLogChars = 4096 - overhead;
  let log = allLogLines.join("\n");
  if (log.length > maxLogChars) {
    while (log.length > maxLogChars && allLogLines.length > 1) {
      allLogLines.shift();
      log = "...\n" + allLogLines.join("\n");
    }
  }

  const finalHpPlayer = result.winner === playerStats.name ? result.winnerHp : result.loserHp;
  const finalHpBoss = result.winner === bossStats.name ? result.winnerHp : result.loserHp;

  const recordText = finalRecord > 0
    ? `Reached: **Floor ${finalRecord}**`
    : "Reached: **Floor 0** (no floors cleared)";

  const embed = new EmbedBuilder()
    .setTitle(`Defeated on Floor ${floor}!`)
    .setColor(0xed4245)
    .setDescription(
      `${log}\n\n${summaryLine}\n\n${recordText}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    )
    .addFields(
      { name: `${playerStats.name}\n\`${displayIdPlayer}\``, value: hpBar(finalHpPlayer, playerStats.hp), inline: true },
      { name: "\u200b", value: "\u200b", inline: true },
      { name: `${bossStats.name}\n\`${displayIdBoss}\``, value: hpBar(finalHpBoss, bossStats.hp), inline: true }
    );

  return embed;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
